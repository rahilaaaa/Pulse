import csv
import io
import uuid
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from apps.commerce.models import (
    Category,
    CommerceSettings,
    Discount,
    DiscountAppliesTo,
    DiscountType,
    MovementType,
    Order,
    OrderActivity,
    OrderLine,
    OrderStatus,
    PaymentStatus,
    PriceList,
    PriceListItem,
    Product,
    ProductStatus,
    ProductVariant,
    RefundStatus,
    ReturnLine,
    ReturnReason,
    ReturnRequest,
    ReturnStatus,
    StockMovement,
)
from apps.parties.models import Party
from common.api.errors import conflict, not_found, validation_error


def ensure_commerce_settings(company) -> CommerceSettings:
    settings_obj, _ = CommerceSettings.objects.get_or_create(
        company=company,
        defaults={
            "currency": "INR",
            "currency_symbol": "₹",
            "tax_rate": Decimal("18.00"),
            "tax_included_in_price": False,
            "default_tax_classification": "standard",
            "order_number_prefix": "ORD-",
            "order_number_next": 1001,
            "return_number_prefix": "RET-",
            "return_number_next": 101,
            "default_low_stock_threshold": 5,
            "auto_deduct_inventory": True,
            "allow_backorders": False,
            "return_window_days": 30,
            "enable_customer_notes": True,
        },
    )
    return settings_obj


def generate_order_number(company) -> str:
    with transaction.atomic():
        settings_obj = CommerceSettings.objects.select_for_update().filter(company=company).first()
        if not settings_obj:
            settings_obj = ensure_commerce_settings(company)
            settings_obj = CommerceSettings.objects.select_for_update().filter(company=company).first()
        num = settings_obj.order_number_next
        settings_obj.order_number_next = num + 1
        settings_obj.save(update_fields=["order_number_next", "updated_at"])
        return f"{settings_obj.order_number_prefix}{num:04d}"


def generate_return_number(company) -> str:
    with transaction.atomic():
        settings_obj = CommerceSettings.objects.select_for_update().filter(company=company).first()
        if not settings_obj:
            settings_obj = ensure_commerce_settings(company)
            settings_obj = CommerceSettings.objects.select_for_update().filter(company=company).first()
        num = settings_obj.return_number_next
        settings_obj.return_number_next = num + 1
        settings_obj.save(update_fields=["return_number_next", "updated_at"])
        return f"{settings_obj.return_number_prefix}{num:04d}"


def resolve_item_pricing(company, product: Product, variant: ProductVariant = None, quantity: int = 1, party: Party = None) -> tuple[int, int]:
    """
    Returns (unit_price_minor, discount_minor).
    Evaluates:
    1. Active price lists assigned to the specific party
    2. Active price lists assigned to the party's kind (person/organization)
    3. Active default price lists
    4. Base variant/product price
    """
    today = timezone.now().date()
    query = PriceList.objects.filter(
        company=company,
        status="active",
    ).filter(
        Q(valid_from__isnull=True) | Q(valid_from__lte=today),
        Q(valid_to__isnull=True) | Q(valid_to__gte=today),
    )

    matched_item = None
    if party:
        # Check customer specific
        matched_item = (
            PriceListItem.objects.filter(
                price_list__in=query.filter(customer_party=party),
                product=product,
                variant=variant,
                min_quantity__lte=quantity,
            )
            .order_by("-min_quantity", "price_minor")
            .first()
        )

        if not matched_item and party.kind:
            # Check party-kind specific
            matched_item = (
                PriceListItem.objects.filter(
                    price_list__in=query.filter(party_kind=party.kind),
                    product=product,
                    variant=variant,
                    min_quantity__lte=quantity,
                )
                .order_by("-min_quantity", "price_minor")
                .first()
            )

    if not matched_item:
        # Check default price lists
        matched_item = (
            PriceListItem.objects.filter(
                price_list__in=query.filter(is_default=True),
                product=product,
                variant=variant,
                min_quantity__lte=quantity,
            )
            .order_by("-min_quantity", "price_minor")
            .first()
        )

    if matched_item:
        price = matched_item.price_minor
        discount = 0
        if matched_item.discount_percentage > 0:
            discount = int(price * (matched_item.discount_percentage / Decimal(100)))
        return price, discount

    # Fallback to variant or product standard selling price
    if variant and variant.price_minor > 0:
        return variant.price_minor, 0
    return product.price_minor, 0


def evaluate_discount(company, code: str, subtotal_minor: int, party: Party = None, products: list[Product] = None) -> tuple[Discount | None, int]:
    """
    Validates discount code eligibility and returns (discount_instance, discount_minor_amount).
    """
    if not code or not code.strip():
        return None, 0

    clean_code = code.strip().upper()
    discount = Discount.objects.filter(company=company, code__iexact=clean_code, is_active=True).first()
    if not discount:
        raise validation_error([{"field": "discount_code", "code": "invalid", "message": f"Discount code '{clean_code}' is not valid."}])

    now = timezone.now()
    if discount.starts_at and discount.starts_at > now:
        raise validation_error([{"field": "discount_code", "code": "not_started", "message": "This discount promotion has not started yet."}])
    if discount.expires_at and discount.expires_at < now:
        raise validation_error([{"field": "discount_code", "code": "expired", "message": "This discount code has expired."}])

    if discount.usage_limit is not None and discount.usage_count >= discount.usage_limit:
        raise validation_error([{"field": "discount_code", "code": "limit_reached", "message": "This discount code has reached its maximum usage limit."}])

    if subtotal_minor < discount.min_order_amount_minor:
        min_curr = discount.min_order_amount_minor / 100
        raise validation_error([{"field": "discount_code", "code": "min_order", "message": f"Order subtotal must be at least ₹{min_curr:.2f} to use this coupon."}])

    if discount.applies_to == DiscountAppliesTo.SPECIFIC_CUSTOMERS and party:
        if not discount.customers.filter(id=party.id).exists():
            raise validation_error([{"field": "discount_code", "code": "not_eligible", "message": "This coupon is not available for this customer account."}])

    # Calculate discount amount
    amount = 0
    if discount.discount_type == DiscountType.PERCENTAGE:
        pct = discount.value / Decimal(100)
        amount = int(subtotal_minor * pct)
    elif discount.discount_type == DiscountType.FIXED_AMOUNT:
        amount = int(discount.value * 100)

    if discount.max_discount_amount_minor and amount > discount.max_discount_amount_minor:
        amount = discount.max_discount_amount_minor

    amount = min(amount, subtotal_minor)
    return discount, amount


def create_order(
    *,
    company,
    party: Party,
    lines_data: list[dict],
    discount_code: str = "",
    notes: str = "",
    shipping_address: str = "",
    billing_address: str = "",
    payment_method: str = "cash_on_delivery",
    auto_confirm: bool = False,
    actor=None,
) -> Order:
    if not lines_data:
        raise validation_error([{"field": "lines", "code": "required", "message": "Add at least one product line."}])

    settings_obj = ensure_commerce_settings(company)

    with transaction.atomic():
        order_num = generate_order_number(company)
        order = Order.objects.create(
            company=company,
            party=party,
            order_number=order_num,
            status=OrderStatus.DRAFT,
            payment_status=PaymentStatus.PENDING,
            payment_method=payment_method,
            currency=settings_obj.currency,
            notes=notes,
            shipping_address=shipping_address,
            billing_address=billing_address,
            placed_by=actor,
        )

        subtotal = 0
        tax_total = 0
        products_for_discount = []

        for item in lines_data:
            product_id = item.get("product_id")
            variant_id = item.get("variant_id")
            quantity = max(1, int(item.get("quantity") or 1))

            product = Product.objects.filter(company=company, pk=product_id).first()
            if not product:
                raise not_found(f"Product ID {product_id} was not found.")

            variant = None
            if variant_id:
                variant = ProductVariant.objects.filter(company=company, product=product, pk=variant_id).first()
                if not variant:
                    raise not_found(f"Product variant ID {variant_id} was not found for product {product.name}.")

            # Validate inventory if not allowing backorders and already tracking
            if product.track_inventory and not settings_obj.allow_backorders:
                avail = variant.available_stock if variant else product.available_stock
                if auto_confirm and quantity > avail:
                    sku_label = variant.sku if variant else product.sku
                    raise conflict(f"Insufficient stock for '{product.name}' ({sku_label}). Requested: {quantity}, Available: {avail}.")

            unit_price, line_discount = resolve_item_pricing(company, product, variant, quantity, party)
            item_price = max(0, unit_price - line_discount)
            line_subtotal = item_price * quantity

            # Line tax calculation
            rate = product.tax_rate if product.tax_rate > 0 else settings_obj.tax_rate
            line_tax = int(line_subtotal * (rate / Decimal(100)))

            line_total = line_subtotal + line_tax
            subtotal += line_subtotal
            tax_total += line_tax
            products_for_discount.append(product)

            OrderLine.objects.create(
                company=company,
                order=order,
                product=product,
                variant=variant,
                quantity=quantity,
                unit_price_minor=unit_price,
                discount_minor=line_discount * quantity,
                tax_minor=line_tax,
                total_minor=line_total,
                notes=item.get("notes", ""),
            )

        # Discount code
        order_discount = 0
        discount_obj = None
        if discount_code:
            discount_obj, order_discount = evaluate_discount(company, discount_code, subtotal, party, products_for_discount)
            if discount_obj:
                order.discount_code = discount_obj.code
                order.discount_minor = order_discount
                discount_obj.usage_count += 1
                discount_obj.save(update_fields=["usage_count", "updated_at"])

        final_total = max(0, subtotal - order_discount + tax_total)
        order.subtotal_minor = subtotal
        order.tax_minor = tax_total
        order.total_minor = final_total
        order.save(update_fields=["subtotal_minor", "discount_code", "discount_minor", "tax_minor", "total_minor", "updated_at"])

        OrderActivity.objects.create(
            company=company,
            order=order,
            actor=actor,
            action="order_created",
            from_status="",
            to_status=OrderStatus.DRAFT,
            notes=f"Order {order_num} created in draft state for customer {party.display_name}.",
        )

        if auto_confirm:
            transition_order_status(order, OrderStatus.CONFIRMED, actor=actor, notes="Auto-confirmed upon creation.")

        return order


def transition_order_status(order: Order, new_status: str, actor=None, notes: str = "") -> Order:
    old_status = order.status
    if old_status == new_status:
        return order

    allowed_transitions = {
        OrderStatus.DRAFT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        OrderStatus.PLACED: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        OrderStatus.CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
        OrderStatus.PROCESSING: [OrderStatus.READY_FOR_SHIPMENT, OrderStatus.CANCELLED],
        OrderStatus.READY_FOR_SHIPMENT: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
        OrderStatus.SHIPPED: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
        OrderStatus.DELIVERED: [OrderStatus.RETURNED],
        OrderStatus.CANCELLED: [],
        OrderStatus.RETURNED: [],
    }

    if new_status not in allowed_transitions.get(old_status, []):
        raise conflict(f"Cannot transition order from '{old_status}' to '{new_status}'.")

    now = timezone.now()
    company = order.company
    settings_obj = ensure_commerce_settings(company)

    with transaction.atomic():
        # Inventory side effects
        if new_status == OrderStatus.CONFIRMED and settings_obj.auto_deduct_inventory:
            for line in order.lines.select_related("product", "variant").all():
                if line.product.track_inventory:
                    adjust_stock(
                        company=company,
                        product=line.product,
                        variant=line.variant,
                        quantity_delta=-line.quantity,
                        movement_type=MovementType.FULFILLMENT,
                        reference_type="order",
                        reference_id=order.order_number,
                        notes=f"Deducted for confirmed order {order.order_number}",
                        actor=actor,
                    )

        elif new_status == OrderStatus.CANCELLED and settings_obj.auto_deduct_inventory:
            # If was previously confirmed/processing/shipped, restore stock
            if old_status in [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_SHIPMENT]:
                for line in order.lines.select_related("product", "variant").all():
                    if line.product.track_inventory:
                        adjust_stock(
                            company=company,
                            product=line.product,
                            variant=line.variant,
                            quantity_delta=line.quantity,
                            movement_type=MovementType.ADJUSTMENT,
                            reference_type="order_cancelled",
                            reference_id=order.order_number,
                            notes=f"Restored stock from cancelled order {order.order_number}",
                            actor=actor,
                        )

        # Status timestamp updates
        order.status = new_status
        if new_status == OrderStatus.CONFIRMED:
            order.confirmed_at = now
        elif new_status == OrderStatus.SHIPPED:
            order.shipped_at = now
        elif new_status == OrderStatus.DELIVERED:
            order.delivered_at = now
        elif new_status == OrderStatus.CANCELLED:
            order.cancelled_at = now

        order.save()

        OrderActivity.objects.create(
            company=company,
            order=order,
            actor=actor,
            action="status_changed",
            from_status=old_status,
            to_status=new_status,
            notes=notes or f"Order status changed to {new_status}.",
        )

        return order


def adjust_stock(
    *,
    company,
    product: Product,
    quantity_delta: int,
    movement_type: str,
    variant: ProductVariant = None,
    reference_type: str = "manual",
    reference_id: str = "",
    notes: str = "",
    actor=None,
) -> StockMovement:
    with transaction.atomic():
        prod = Product.objects.select_for_update().get(id=product.id, company=company)
        before = prod.stock_quantity
        after = before + quantity_delta
        prod.stock_quantity = after
        prod.save(update_fields=["stock_quantity", "updated_at"])

        v_before = 0
        v_after = 0
        if variant:
            var = ProductVariant.objects.select_for_update().get(id=variant.id, company=company)
            v_before = var.stock_quantity
            v_after = v_before + quantity_delta
            var.stock_quantity = v_after
            var.save(update_fields=["stock_quantity", "updated_at"])

        movement = StockMovement.objects.create(
            company=company,
            product=prod,
            variant=variant,
            movement_type=movement_type,
            quantity=quantity_delta,
            quantity_before=before,
            quantity_after=after,
            reference_type=reference_type,
            reference_id=reference_id,
            notes=notes,
            actor=actor,
        )
        return movement


def create_return_request(
    *,
    company,
    order: Order,
    reason: str,
    lines_data: list[dict],
    notes: str = "",
    actor=None,
) -> ReturnRequest:
    if not lines_data:
        raise validation_error([{"field": "lines", "code": "required", "message": "Specify at least one product to return."}])

    with transaction.atomic():
        ret_num = generate_return_number(company)
        ret = ReturnRequest.objects.create(
            company=company,
            return_number=ret_num,
            order=order,
            party=order.party,
            status=ReturnStatus.REQUESTED,
            refund_status=RefundStatus.PENDING,
            reason=reason,
            notes=notes,
            created_by=actor,
        )

        total_refund = 0
        for item in lines_data:
            line_id = item.get("order_line_id")
            quantity = max(1, int(item.get("quantity") or 1))
            order_line = OrderLine.objects.filter(company=company, order=order, pk=line_id).first()
            if not order_line:
                raise not_found(f"Order line {line_id} was not found on order {order.order_number}.")

            if quantity > order_line.quantity:
                raise validation_error([{"field": "quantity", "code": "exceeds", "message": f"Cannot return more than purchased quantity ({order_line.quantity})."}])

            refund_price = order_line.unit_price_minor
            total_refund += refund_price * quantity

            ReturnLine.objects.create(
                company=company,
                return_request=ret,
                order_line=order_line,
                product=order_line.product,
                variant=order_line.variant,
                quantity=quantity,
                refund_unit_price_minor=refund_price,
                restock_inventory=item.get("restock_inventory", True),
            )

        ret.refund_amount_minor = total_refund
        ret.save(update_fields=["refund_amount_minor", "updated_at"])

        OrderActivity.objects.create(
            company=company,
            order=order,
            actor=actor,
            action="return_requested",
            from_status=order.status,
            to_status=order.status,
            notes=f"Return request {ret_num} opened for ₹{total_refund/100:.2f}.",
        )

        return ret


def process_return_action(
    *,
    return_request: ReturnRequest,
    action: str,
    actor=None,
    notes: str = "",
) -> ReturnRequest:
    company = return_request.company
    now = timezone.now()

    with transaction.atomic():
        if action == "approve":
            return_request.status = ReturnStatus.APPROVED
            return_request.approved_by = actor
            return_request.approved_at = now
        elif action == "receive":
            return_request.status = ReturnStatus.RECEIVED
        elif action == "complete":
            return_request.status = ReturnStatus.COMPLETED
            return_request.completed_at = now
            # Restock eligible lines
            for line in return_request.lines.all():
                if line.restock_inventory and line.product.track_inventory:
                    adjust_stock(
                        company=company,
                        product=line.product,
                        variant=line.variant,
                        quantity_delta=line.quantity,
                        movement_type=MovementType.RETURN_RESTOCK,
                        reference_type="return",
                        reference_id=return_request.return_number,
                        notes=f"Restocked from completed return {return_request.return_number}",
                        actor=actor,
                    )
        elif action == "reject":
            return_request.status = ReturnStatus.REJECTED
        elif action == "refund":
            return_request.refund_status = RefundStatus.REFUNDED
        else:
            raise validation_error([{"field": "action", "code": "invalid", "message": f"Unsupported return action '{action}'."}])

        if notes:
            return_request.notes = (return_request.notes + "\n" + notes).strip()

        return_request.save()
        return return_request


def get_commerce_overview_dashboard(company, date_filter: str = "30d") -> dict:
    settings_obj = ensure_commerce_settings(company)
    now = timezone.now()
    start_date = None

    if date_filter == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif date_filter == "7d":
        start_date = now - timedelta(days=7)
    elif date_filter == "30d":
        start_date = now - timedelta(days=30)
    elif date_filter == "year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0)

    orders_qs = Order.objects.filter(company=company)
    if start_date:
        filtered_orders = orders_qs.filter(created_at__gte=start_date)
    else:
        filtered_orders = orders_qs

    # KPI values
    revenue_statuses = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_SHIPMENT, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
    total_sales_minor = filtered_orders.filter(status__in=revenue_statuses).aggregate(s=Sum("total_minor"))["s"] or 0
    total_orders_count = filtered_orders.count()

    total_customers_count = Party.objects.filter(company=company, commerce_orders__company=company).distinct().count()
    if total_customers_count == 0:
        total_customers_count = Party.objects.filter(company=company, status="active").count()

    total_products_count = Product.objects.filter(company=company, status=ProductStatus.ACTIVE).count()

    pending_orders_count = orders_qs.filter(
        status__in=[OrderStatus.DRAFT, OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING]
    ).count()

    low_stock_products_count = Product.objects.filter(
        company=company,
        status=ProductStatus.ACTIVE,
        track_inventory=True,
        stock_quantity__lte=F("low_stock_threshold"),
    ).count()

    # Sales trend (last 7 data points)
    trend_points = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        day_start = timezone.datetime(day.year, day.month, day.day, tzinfo=timezone.get_current_timezone())
        day_end = day_start + timedelta(days=1)
        day_sales = orders_qs.filter(created_at__gte=day_start, created_at__lt=day_end, status__in=revenue_statuses).aggregate(s=Sum("total_minor"))["s"] or 0
        day_orders = orders_qs.filter(created_at__gte=day_start, created_at__lt=day_end).count()
        trend_points.append({
            "date": day.strftime("%b %d"),
            "sales_minor": day_sales,
            "orders": day_orders,
        })

    # Orders by status breakdown
    status_counts = orders_qs.values("status").annotate(count=Count("id"))
    orders_by_status = {item["status"]: item["count"] for item in status_counts}

    # Sales by category
    sales_by_cat_raw = (
        OrderLine.objects.filter(company=company, order__status__in=revenue_statuses)
        .values("product__category__name")
        .annotate(total=Sum("total_minor"), count=Sum("quantity"))
        .order_by("-total")[:6]
    )
    sales_by_category = [
        {
            "category": item["product__category__name"] or "Uncategorized",
            "total_minor": item["total"] or 0,
            "quantity": item["count"] or 0,
        }
        for item in sales_by_cat_raw
    ]

    # Top selling products
    top_prods_raw = (
        OrderLine.objects.filter(company=company, order__status__in=revenue_statuses)
        .values("product__id", "product__name", "product__sku")
        .annotate(total_revenue=Sum("total_minor"), units_sold=Sum("quantity"))
        .order_by("-total_revenue")[:5]
    )
    top_selling_products = [
        {
            "id": str(item["product__id"]),
            "name": item["product__name"],
            "sku": item["product__sku"],
            "units_sold": item["units_sold"] or 0,
            "revenue_minor": item["total_revenue"] or 0,
        }
        for item in top_prods_raw
    ]

    # Top customers
    top_custs_raw = (
        orders_qs.filter(status__in=revenue_statuses)
        .values("party__id", "party__display_name", "party__kind", "party__email")
        .annotate(total_spent=Sum("total_minor"), orders_count=Count("id"))
        .order_by("-total_spent")[:5]
    )
    top_customers = [
        {
            "id": str(item["party__id"]),
            "name": item["party__display_name"],
            "kind": item["party__kind"],
            "email": item["party__email"],
            "total_spent_minor": item["total_spent"] or 0,
            "orders_count": item["orders_count"],
        }
        for item in top_custs_raw
    ]

    # Recent orders
    recent_orders = [
        {
            "id": str(o.id),
            "order_number": o.order_number,
            "customer_name": o.party.display_name,
            "party_id": str(o.party_id),
            "status": o.status,
            "payment_status": o.payment_status,
            "total_minor": o.total_minor,
            "currency": o.currency,
            "created_at": o.created_at.isoformat(),
        }
        for o in orders_qs.select_related("party").order_by("-created_at")[:6]
    ]

    # Low-stock alerts
    low_stock_alerts = [
        {
            "id": str(p.id),
            "name": p.name,
            "sku": p.sku,
            "stock_quantity": p.stock_quantity,
            "reserved_quantity": p.reserved_quantity,
            "available_stock": p.available_stock,
            "low_stock_threshold": p.low_stock_threshold,
            "uom": p.uom,
        }
        for p in Product.objects.filter(
            company=company,
            status=ProductStatus.ACTIVE,
            track_inventory=True,
            stock_quantity__lte=F("low_stock_threshold"),
        ).order_by("stock_quantity")[:6]
    ]

    # Pending returns
    pending_returns = [
        {
            "id": str(r.id),
            "return_number": r.return_number,
            "order_number": r.order.order_number,
            "customer_name": r.party.display_name,
            "refund_amount_minor": r.refund_amount_minor,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in ReturnRequest.objects.filter(
            company=company,
            status__in=[ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.RECEIVED],
        ).select_related("order", "party").order_by("-created_at")[:5]
    ]

    return {
        "kpis": {
            "total_sales_minor": total_sales_minor,
            "total_orders": total_orders_count,
            "total_customers": total_customers_count,
            "total_products": total_products_count,
            "pending_orders": pending_orders_count,
            "low_stock_products": low_stock_products_count,
            "currency": settings_obj.currency,
            "currency_symbol": settings_obj.currency_symbol,
        },
        "sales_trend": trend_points,
        "orders_by_status": orders_by_status,
        "sales_by_category": sales_by_category,
        "top_selling_products": top_selling_products,
        "top_customers": top_customers,
        "recent_orders": recent_orders,
        "low_stock_alerts": low_stock_alerts,
        "pending_returns": pending_returns,
        "date_filter": date_filter,
    }


def generate_commerce_report_csv(company, report_type: str = "sales") -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "sales":
        writer.writerow(["Order Number", "Date", "Customer", "Status", "Payment Status", "Subtotal (INR)", "Discount (INR)", "Tax (INR)", "Total (INR)"])
        for o in Order.objects.filter(company=company).select_related("party").order_by("-created_at"):
            writer.writerow([
                o.order_number,
                o.created_at.strftime("%Y-%m-%d %H:%M"),
                o.party.display_name,
                o.status,
                o.payment_status,
                f"{o.subtotal_minor/100:.2f}",
                f"{o.discount_minor/100:.2f}",
                f"{o.tax_minor/100:.2f}",
                f"{o.total_minor/100:.2f}",
            ])

    elif report_type == "products":
        writer.writerow(["SKU", "Product Name", "Category", "Status", "Selling Price (INR)", "Cost Price (INR)", "Stock On Hand", "Reserved", "Available", "Low Stock Threshold"])
        for p in Product.objects.filter(company=company).select_related("category").order_by("name"):
            writer.writerow([
                p.sku,
                p.name,
                p.category.name if p.category else "Uncategorized",
                p.status,
                f"{p.price_minor/100:.2f}",
                f"{p.cost_price_minor/100:.2f}",
                p.stock_quantity,
                p.reserved_quantity,
                p.available_stock,
                p.low_stock_threshold,
            ])

    elif report_type == "returns":
        writer.writerow(["Return Number", "Order Number", "Customer", "Date", "Reason", "Status", "Refund Status", "Refund Amount (INR)"])
        for r in ReturnRequest.objects.filter(company=company).select_related("order", "party").order_by("-created_at"):
            writer.writerow([
                r.return_number,
                r.order.order_number,
                r.party.display_name,
                r.created_at.strftime("%Y-%m-%d"),
                r.reason,
                r.status,
                r.refund_status,
                f"{r.refund_amount_minor/100:.2f}",
            ])

    elif report_type == "inventory":
        writer.writerow(["SKU", "Product Name", "Stock On Hand", "Available", "Unit Cost (INR)", "Inventory Valuation (INR)", "Reorder Required"])
        for p in Product.objects.filter(company=company, track_inventory=True).order_by("name"):
            val = (p.stock_quantity * p.cost_price_minor) / 100
            writer.writerow([
                p.sku,
                p.name,
                p.stock_quantity,
                p.available_stock,
                f"{p.cost_price_minor/100:.2f}",
                f"{val:.2f}",
                "YES" if p.is_low_stock else "NO",
            ])

    return output.getvalue()

