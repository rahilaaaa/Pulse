from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import effective_permission_codes, require_membership
from apps.billing.access import access_mode, current_subscription
from apps.commerce.models import (
    Category,
    CategoryStatus,
    CommerceSettings,
    Discount,
    DiscountAppliesTo,
    DiscountType,
    MovementType,
    Order,
    OrderActivity,
    OrderLine,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    PriceList,
    PriceListItem,
    Product,
    ProductStatus,
    ProductType,
    ProductVariant,
    RefundStatus,
    ReturnLine,
    ReturnReason,
    ReturnRequest,
    ReturnStatus,
    StockMovement,
)
from apps.commerce.services import (
    adjust_stock,
    create_order,
    create_return_request,
    ensure_commerce_settings,
    evaluate_discount,
    generate_commerce_report_csv,
    get_commerce_overview_dashboard,
    process_return_action,
    transition_order_status,
)
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.parties.models import Party, PartyKind, PartyStatus
from common.api.errors import conflict, not_found, permission_denied, validation_error


def _installed(company):
    if not CompanyModuleInstallation.objects.filter(
        company=company, module_id="commerce", status=InstallationStatus.INSTALLED
    ).exists():
        raise not_found("Commerce is not installed.")


def _require_commerce_perm(user, company_id, *codes: str):
    membership = require_membership(user, company_id)
    mode = access_mode(membership.company, current_subscription(membership.company))
    if mode == "blocked" or (mode not in {"full", "grace"} and not any(c in {"billing.view", "billing.manage"} for c in codes)):
        raise permission_denied("The company subscription does not allow this action.")
    user_perms = effective_permission_codes(membership)
    # Check if caller has any of the requested codes or global manage
    all_acceptable = set(codes) | {"commerce.manage"}
    if not (user_perms & all_acceptable):
        raise permission_denied()
    return membership


class CommerceOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.dashboard", "commerce.view")
        _installed(membership.company)
        date_filter = request.query_params.get("date_filter", "30d")
        payload = get_commerce_overview_dashboard(membership.company, date_filter=date_filter)
        return Response(payload)


class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.products", "commerce.view")
        _installed(membership.company)

        qs = Product.objects.filter(company=membership.company).select_related("category", "vendor").prefetch_related("variants")

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(barcode__icontains=search))

        category_id = request.query_params.get("category_id")
        if category_id:
            qs = qs.filter(category_id=category_id)

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        else:
            qs = qs.exclude(status=ProductStatus.ARCHIVED)

        if request.query_params.get("low_stock") == "true":
            qs = qs.filter(track_inventory=True, stock_quantity__lte=F("low_stock_threshold"))

        results = [
            {
                "id": str(p.id),
                "name": p.name,
                "sku": p.sku,
                "description": p.description,
                "category_id": str(p.category_id) if p.category_id else None,
                "category_name": p.category.name if p.category else "",
                "vendor_id": str(p.vendor_id) if p.vendor_id else None,
                "vendor_name": p.vendor.display_name if p.vendor else "",
                "image_url": p.image_url,
                "product_type": p.product_type,
                "barcode": p.barcode,
                "price_minor": p.price_minor,
                "cost_price_minor": p.cost_price_minor,
                "tax_rate": str(p.tax_rate),
                "tax_classification": p.tax_classification,
                "uom": p.uom,
                "status": p.status,
                "stock_quantity": p.stock_quantity,
                "reserved_quantity": p.reserved_quantity,
                "available_stock": p.available_stock,
                "low_stock_threshold": p.low_stock_threshold,
                "track_inventory": p.track_inventory,
                "is_low_stock": p.is_low_stock,
                "attributes": p.attributes,
                "variants_count": p.variants.count(),
                "created_at": p.created_at.isoformat(),
            }
            for p in qs.order_by("name")
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.create.products", "commerce.manage")
        _installed(membership.company)

        name = (request.data.get("name") or "").strip()
        sku = (request.data.get("sku") or "").strip().upper()
        if not name or not sku:
            raise validation_error([{"field": "name", "code": "required", "message": "Product name and SKU are required."}])

        if Product.objects.filter(company=membership.company, sku=sku).exists():
            raise conflict(f"A product with SKU '{sku}' already exists.")

        category = None
        category_id = request.data.get("category_id")
        if category_id:
            category = Category.objects.filter(company=membership.company, pk=category_id).first()

        vendor = None
        vendor_id = request.data.get("vendor_id")
        if vendor_id:
            vendor = Party.objects.filter(company=membership.company, pk=vendor_id).first()

        product = Product.objects.create(
            company=membership.company,
            name=name[:255],
            sku=sku[:64],
            category=category,
            vendor=vendor,
            description=request.data.get("description", ""),
            image_url=request.data.get("image_url", ""),
            product_type=request.data.get("product_type", ProductType.SIMPLE),
            barcode=request.data.get("barcode", "")[:64],
            price_minor=int(request.data.get("price_minor") or 0),
            cost_price_minor=int(request.data.get("cost_price_minor") or 0),
            tax_rate=Decimal(str(request.data.get("tax_rate") or "0.00")),
            tax_classification=request.data.get("tax_classification", "standard"),
            uom=request.data.get("uom", "pcs")[:32],
            status=request.data.get("status", ProductStatus.ACTIVE),
            stock_quantity=int(request.data.get("stock_quantity") or 0),
            reserved_quantity=0,
            low_stock_threshold=int(request.data.get("low_stock_threshold") or 5),
            track_inventory=bool(request.data.get("track_inventory", True)),
            attributes=request.data.get("attributes") or {},
        )

        return Response(
            {
                "id": str(product.id),
                "name": product.name,
                "sku": product.sku,
                "price_minor": product.price_minor,
                "stock_quantity": product.stock_quantity,
                "status": product.status,
            },
            status=201,
        )


class ProductDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, product_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.products", "commerce.view")
        _installed(membership.company)

        product = Product.objects.filter(company=membership.company, pk=product_id).select_related("category", "vendor").first()
        if not product:
            raise not_found("Product not found.")

        variants = [
            {
                "id": str(v.id),
                "name": v.name,
                "sku": v.sku,
                "barcode": v.barcode,
                "price_minor": v.price_minor,
                "cost_price_minor": v.cost_price_minor,
                "stock_quantity": v.stock_quantity,
                "reserved_quantity": v.reserved_quantity,
                "available_stock": v.available_stock,
                "attributes": v.attributes,
                "status": v.status,
            }
            for v in product.variants.all()
        ]

        recent_movements = [
            {
                "id": str(m.id),
                "movement_type": m.movement_type,
                "quantity": m.quantity,
                "quantity_before": m.quantity_before,
                "quantity_after": m.quantity_after,
                "reference_type": m.reference_type,
                "reference_id": m.reference_id,
                "notes": m.notes,
                "created_at": m.created_at.isoformat(),
            }
            for m in product.stock_movements.order_by("-created_at")[:10]
        ]

        return Response(
            {
                "id": str(product.id),
                "name": product.name,
                "sku": product.sku,
                "description": product.description,
                "category_id": str(product.category_id) if product.category_id else None,
                "category_name": product.category.name if product.category else "",
                "vendor_id": str(product.vendor_id) if product.vendor_id else None,
                "vendor_name": product.vendor.display_name if product.vendor else "",
                "image_url": product.image_url,
                "product_type": product.product_type,
                "barcode": product.barcode,
                "price_minor": product.price_minor,
                "cost_price_minor": product.cost_price_minor,
                "tax_rate": str(product.tax_rate),
                "tax_classification": product.tax_classification,
                "uom": product.uom,
                "status": product.status,
                "stock_quantity": product.stock_quantity,
                "reserved_quantity": product.reserved_quantity,
                "available_stock": product.available_stock,
                "low_stock_threshold": product.low_stock_threshold,
                "track_inventory": product.track_inventory,
                "is_low_stock": product.is_low_stock,
                "attributes": product.attributes,
                "variants": variants,
                "recent_movements": recent_movements,
                "created_at": product.created_at.isoformat(),
                "updated_at": product.updated_at.isoformat(),
            }
        )

    def patch(self, request, company_id, product_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.update.products", "commerce.manage")
        _installed(membership.company)

        product = Product.objects.filter(company=membership.company, pk=product_id).first()
        if not product:
            raise not_found("Product not found.")

        data = request.data
        if "name" in data and data["name"].strip():
            product.name = data["name"].strip()[:255]
        if "sku" in data and data["sku"].strip():
            new_sku = data["sku"].strip().upper()[:64]
            if new_sku != product.sku and Product.objects.filter(company=membership.company, sku=new_sku).exists():
                raise conflict(f"SKU '{new_sku}' is already taken.")
            product.sku = new_sku
        if "category_id" in data:
            cat_id = data["category_id"]
            product.category = Category.objects.filter(company=membership.company, pk=cat_id).first() if cat_id else None
        if "vendor_id" in data:
            v_id = data["vendor_id"]
            product.vendor = Party.objects.filter(company=membership.company, pk=v_id).first() if v_id else None
        if "description" in data:
            product.description = data["description"]
        if "image_url" in data:
            product.image_url = data["image_url"]
        if "barcode" in data:
            product.barcode = data["barcode"][:64]
        if "product_type" in data and data["product_type"] in ProductType.values:
            product.product_type = data["product_type"]
        if "price_minor" in data:
            product.price_minor = max(0, int(data["price_minor"]))
        if "cost_price_minor" in data:
            product.cost_price_minor = max(0, int(data["cost_price_minor"]))
        if "tax_rate" in data:
            product.tax_rate = Decimal(str(data["tax_rate"]))
        if "tax_classification" in data:
            product.tax_classification = data["tax_classification"][:32]
        if "uom" in data:
            product.uom = data["uom"][:32]
        if "status" in data and data["status"] in ProductStatus.values:
            product.status = data["status"]
        if "stock_quantity" in data:
            product.stock_quantity = int(data["stock_quantity"])
        if "low_stock_threshold" in data:
            product.low_stock_threshold = max(0, int(data["low_stock_threshold"]))
        if "track_inventory" in data:
            product.track_inventory = bool(data["track_inventory"])
        if "attributes" in data and isinstance(data["attributes"], dict):
            product.attributes = data["attributes"]

        product.save()
        return Response({"id": str(product.id), "name": product.name, "sku": product.sku, "price_minor": product.price_minor, "status": product.status})

    def delete(self, request, company_id, product_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.archive.products", "commerce.manage")
        _installed(membership.company)

        product = Product.objects.filter(company=membership.company, pk=product_id).first()
        if not product:
            raise not_found("Product not found.")

        product.status = ProductStatus.ARCHIVED
        product.save(update_fields=["status", "updated_at"])
        return Response({"message": f"Product '{product.name}' archived."})


class ProductVariantListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, product_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.products", "commerce.view")
        _installed(membership.company)
        product = Product.objects.filter(company=membership.company, pk=product_id).first()
        if not product:
            raise not_found("Product not found.")

        variants = [
            {
                "id": str(v.id),
                "name": v.name,
                "sku": v.sku,
                "barcode": v.barcode,
                "price_minor": v.price_minor,
                "cost_price_minor": v.cost_price_minor,
                "stock_quantity": v.stock_quantity,
                "reserved_quantity": v.reserved_quantity,
                "available_stock": v.available_stock,
                "attributes": v.attributes,
                "status": v.status,
            }
            for v in product.variants.all()
        ]
        return Response({"results": variants})

    def post(self, request, company_id, product_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.create.products", "commerce.manage")
        _installed(membership.company)
        product = Product.objects.filter(company=membership.company, pk=product_id).first()
        if not product:
            raise not_found("Product not found.")

        name = (request.data.get("name") or "").strip()
        sku = (request.data.get("sku") or "").strip().upper()
        if not name or not sku:
            raise validation_error([{"field": "name", "code": "required", "message": "Variant name and SKU are required."}])

        if ProductVariant.objects.filter(company=membership.company, sku=sku).exists():
            raise conflict(f"A variant with SKU '{sku}' already exists.")

        variant = ProductVariant.objects.create(
            company=membership.company,
            product=product,
            name=name[:255],
            sku=sku[:64],
            barcode=request.data.get("barcode", "")[:64],
            price_minor=int(request.data.get("price_minor") or product.price_minor),
            cost_price_minor=int(request.data.get("cost_price_minor") or product.cost_price_minor),
            stock_quantity=int(request.data.get("stock_quantity") or 0),
            attributes=request.data.get("attributes") or {},
            status=request.data.get("status", ProductStatus.ACTIVE),
        )

        return Response(
            {
                "id": str(variant.id),
                "name": variant.name,
                "sku": variant.sku,
                "price_minor": variant.price_minor,
                "stock_quantity": variant.stock_quantity,
            },
            status=201,
        )


class ProductVariantDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, variant_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.update.products", "commerce.manage")
        _installed(membership.company)
        variant = ProductVariant.objects.filter(company=membership.company, pk=variant_id).first()
        if not variant:
            raise not_found("Variant not found.")

        data = request.data
        if "name" in data:
            variant.name = data["name"][:255]
        if "price_minor" in data:
            variant.price_minor = max(0, int(data["price_minor"]))
        if "cost_price_minor" in data:
            variant.cost_price_minor = max(0, int(data["cost_price_minor"]))
        if "stock_quantity" in data:
            variant.stock_quantity = int(data["stock_quantity"])
        if "barcode" in data:
            variant.barcode = data["barcode"][:64]
        if "attributes" in data and isinstance(data["attributes"], dict):
            variant.attributes = data["attributes"]
        if "status" in data:
            variant.status = data["status"]

        variant.save()
        return Response({"id": str(variant.id), "name": variant.name, "sku": variant.sku, "price_minor": variant.price_minor})

    def delete(self, request, company_id, variant_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.update.products", "commerce.manage")
        _installed(membership.company)
        variant = ProductVariant.objects.filter(company=membership.company, pk=variant_id).first()
        if not variant:
            raise not_found("Variant not found.")
        variant.status = ProductStatus.ARCHIVED
        variant.save(update_fields=["status", "updated_at"])
        return Response({"message": "Variant archived."})


class CategoryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.products", "commerce.view")
        _installed(membership.company)

        categories = (
            Category.objects.filter(company=membership.company)
            .annotate(product_count=Count("products", filter=~Q(products__status=ProductStatus.ARCHIVED)))
            .select_related("parent")
            .order_by("display_order", "name")
        )

        results = [
            {
                "id": str(c.id),
                "name": c.name,
                "slug": c.slug,
                "code": c.code,
                "description": c.description,
                "parent_id": str(c.parent_id) if c.parent_id else None,
                "parent_name": c.parent.name if c.parent else None,
                "status": c.status,
                "display_order": c.display_order,
                "product_count": c.product_count,
            }
            for c in categories
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.categories", "commerce.manage")
        _installed(membership.company)

        name = (request.data.get("name") or "").strip()
        slug = (request.data.get("slug") or "").strip().lower()
        if not name:
            raise validation_error([{"field": "name", "code": "required", "message": "Category name is required."}])
        if not slug:
            slug = name.lower().replace(" ", "-")[:100]

        if Category.objects.filter(company=membership.company, slug=slug).exists():
            slug = f"{slug}-{uuid.uuid4().hex[:4]}"

        parent = None
        parent_id = request.data.get("parent_id")
        if parent_id:
            parent = Category.objects.filter(company=membership.company, pk=parent_id).first()

        cat = Category.objects.create(
            company=membership.company,
            name=name[:255],
            slug=slug[:100],
            code=request.data.get("code", "")[:64],
            description=request.data.get("description", ""),
            parent=parent,
            status=request.data.get("status", CategoryStatus.ACTIVE),
            display_order=int(request.data.get("display_order") or 0),
        )

        return Response(
            {
                "id": str(cat.id),
                "name": cat.name,
                "slug": cat.slug,
                "code": cat.code,
                "status": cat.status,
            },
            status=201,
        )


class CategoryDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, category_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.categories", "commerce.manage")
        _installed(membership.company)

        cat = Category.objects.filter(company=membership.company, pk=category_id).first()
        if not cat:
            raise not_found("Category not found.")

        data = request.data
        if "name" in data and data["name"].strip():
            cat.name = data["name"].strip()[:255]
        if "code" in data:
            cat.code = data["code"][:64]
        if "description" in data:
            cat.description = data["description"]
        if "status" in data:
            cat.status = data["status"]
        if "display_order" in data:
            cat.display_order = int(data["display_order"])
        if "parent_id" in data:
            p_id = data["parent_id"]
            cat.parent = Category.objects.filter(company=membership.company, pk=p_id).first() if p_id else None

        cat.save()
        return Response({"id": str(cat.id), "name": cat.name, "status": cat.status})

    def delete(self, request, company_id, category_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.categories", "commerce.manage")
        _installed(membership.company)

        cat = Category.objects.filter(company=membership.company, pk=category_id).first()
        if not cat:
            raise not_found("Category not found.")

        cat.delete()
        return Response({"message": "Category deleted."})


class PriceListListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.view")
        _installed(membership.company)

        qs = PriceList.objects.filter(company=membership.company).select_related("customer_party").prefetch_related("items").order_by("name")

        results = [
            {
                "id": str(pl.id),
                "name": pl.name,
                "code": pl.code,
                "description": pl.description,
                "currency": pl.currency,
                "is_default": pl.is_default,
                "customer_party_id": str(pl.customer_party_id) if pl.customer_party_id else None,
                "customer_name": pl.customer_party.display_name if pl.customer_party else None,
                "party_kind": pl.party_kind,
                "valid_from": pl.valid_from.isoformat() if pl.valid_from else None,
                "valid_to": pl.valid_to.isoformat() if pl.valid_to else None,
                "status": pl.status,
                "items_count": pl.items.count(),
            }
            for pl in qs
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.manage")
        _installed(membership.company)

        name = (request.data.get("name") or "").strip()
        code = (request.data.get("code") or "").strip().upper()
        if not name or not code:
            raise validation_error([{"field": "name", "code": "required", "message": "Price list name and code are required."}])

        if PriceList.objects.filter(company=membership.company, code=code).exists():
            raise conflict(f"Price list with code '{code}' already exists.")

        cust = None
        cust_id = request.data.get("customer_party_id")
        if cust_id:
            cust = Party.objects.filter(company=membership.company, pk=cust_id).first()

        is_default = bool(request.data.get("is_default", False))
        if is_default:
            PriceList.objects.filter(company=membership.company, is_default=True).update(is_default=False)

        pl = PriceList.objects.create(
            company=membership.company,
            name=name[:255],
            code=code[:64],
            description=request.data.get("description", ""),
            currency=request.data.get("currency", "INR")[:3],
            is_default=is_default,
            customer_party=cust,
            party_kind=request.data.get("party_kind", "all"),
            valid_from=request.data.get("valid_from") or None,
            valid_to=request.data.get("valid_to") or None,
            status=request.data.get("status", "active"),
        )

        return Response(
            {
                "id": str(pl.id),
                "name": pl.name,
                "code": pl.code,
                "is_default": pl.is_default,
            },
            status=201,
        )


class PriceListDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, price_list_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.view")
        _installed(membership.company)

        pl = PriceList.objects.filter(company=membership.company, pk=price_list_id).select_related("customer_party").first()
        if not pl:
            raise not_found("Price list not found.")

        items = [
            {
                "id": str(item.id),
                "product_id": str(item.product_id),
                "product_name": item.product.name,
                "product_sku": item.product.sku,
                "variant_id": str(item.variant_id) if item.variant_id else None,
                "variant_name": item.variant.name if item.variant else None,
                "min_quantity": item.min_quantity,
                "price_minor": item.price_minor,
                "discount_percentage": str(item.discount_percentage),
            }
            for item in pl.items.select_related("product", "variant").all()
        ]

        return Response(
            {
                "id": str(pl.id),
                "name": pl.name,
                "code": pl.code,
                "description": pl.description,
                "currency": pl.currency,
                "is_default": pl.is_default,
                "customer_party_id": str(pl.customer_party_id) if pl.customer_party_id else None,
                "customer_name": pl.customer_party.display_name if pl.customer_party else None,
                "party_kind": pl.party_kind,
                "valid_from": pl.valid_from.isoformat() if pl.valid_from else None,
                "valid_to": pl.valid_to.isoformat() if pl.valid_to else None,
                "status": pl.status,
                "items": items,
            }
        )

    def patch(self, request, company_id, price_list_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.manage")
        _installed(membership.company)

        pl = PriceList.objects.filter(company=membership.company, pk=price_list_id).first()
        if not pl:
            raise not_found("Price list not found.")

        data = request.data
        if "name" in data:
            pl.name = data["name"][:255]
        if "description" in data:
            pl.description = data["description"]
        if "status" in data:
            pl.status = data["status"]
        if "is_default" in data and bool(data["is_default"]):
            PriceList.objects.filter(company=membership.company, is_default=True).exclude(pk=pl.pk).update(is_default=False)
            pl.is_default = True
        elif "is_default" in data:
            pl.is_default = bool(data["is_default"])

        pl.save()
        return Response({"id": str(pl.id), "name": pl.name, "status": pl.status, "is_default": pl.is_default})

    def delete(self, request, company_id, price_list_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.manage")
        _installed(membership.company)
        pl = PriceList.objects.filter(company=membership.company, pk=price_list_id).first()
        if not pl:
            raise not_found("Price list not found.")
        pl.delete()
        return Response({"message": "Price list deleted."})


class PriceListItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, price_list_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.manage")
        _installed(membership.company)

        pl = PriceList.objects.filter(company=membership.company, pk=price_list_id).first()
        if not pl:
            raise not_found("Price list not found.")

        product = Product.objects.filter(company=membership.company, pk=request.data.get("product_id")).first()
        if not product:
            raise not_found("Product not found.")

        variant = None
        variant_id = request.data.get("variant_id")
        if variant_id:
            variant = ProductVariant.objects.filter(company=membership.company, product=product, pk=variant_id).first()

        min_qty = max(1, int(request.data.get("min_quantity") or 1))
        price_minor = int(request.data.get("price_minor") or product.price_minor)
        discount_pct = Decimal(str(request.data.get("discount_percentage") or "0.00"))

        item, _created = PriceListItem.objects.update_or_create(
            company=membership.company,
            price_list=pl,
            product=product,
            variant=variant,
            min_quantity=min_qty,
            defaults={
                "price_minor": price_minor,
                "discount_percentage": discount_pct,
            },
        )

        return Response(
            {
                "id": str(item.id),
                "product_name": product.name,
                "min_quantity": item.min_quantity,
                "price_minor": item.price_minor,
            },
            status=201,
        )

    def delete(self, request, company_id, price_list_id, item_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.pricing", "commerce.manage")
        _installed(membership.company)

        item = PriceListItem.objects.filter(company=membership.company, price_list_id=price_list_id, pk=item_id).first()
        if not item:
            raise not_found("Price list item not found.")
        item.delete()
        return Response({"message": "Item removed from price list."})


class InventoryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.products", "commerce.view")
        _installed(membership.company)

        products = Product.objects.filter(company=membership.company, track_inventory=True).select_related("category").order_by("name")

        items = [
            {
                "id": str(p.id),
                "name": p.name,
                "sku": p.sku,
                "category_name": p.category.name if p.category else "Uncategorized",
                "stock_quantity": p.stock_quantity,
                "reserved_quantity": p.reserved_quantity,
                "available_stock": p.available_stock,
                "low_stock_threshold": p.low_stock_threshold,
                "is_low_stock": p.is_low_stock,
                "uom": p.uom,
                "cost_price_minor": p.cost_price_minor,
                "valuation_minor": p.stock_quantity * p.cost_price_minor,
            }
            for p in products
        ]

        recent_movements = [
            {
                "id": str(m.id),
                "product_id": str(m.product_id),
                "product_name": m.product.name,
                "product_sku": m.product.sku,
                "movement_type": m.movement_type,
                "quantity": m.quantity,
                "quantity_before": m.quantity_before,
                "quantity_after": m.quantity_after,
                "reference_type": m.reference_type,
                "reference_id": m.reference_id,
                "notes": m.notes,
                "created_at": m.created_at.isoformat(),
            }
            for m in StockMovement.objects.filter(company=membership.company).select_related("product").order_by("-created_at")[:25]
        ]

        total_valuation = sum(item["valuation_minor"] for item in items)
        low_stock_count = sum(1 for item in items if item["is_low_stock"])

        return Response(
            {
                "inventory_summary": {
                    "total_tracked_items": len(items),
                    "total_stock_units": sum(item["stock_quantity"] for item in items),
                    "low_stock_items": low_stock_count,
                    "total_valuation_minor": total_valuation,
                },
                "items": items,
                "recent_movements": recent_movements,
                "integration_status": {
                    "inventory_module_installed": False,
                    "notice": "Using native Commerce stock tracking. Install the standalone Inventory & Warehousing module for multi-warehouse and bin location tracking.",
                },
            }
        )


class StockAdjustmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.update.products", "commerce.manage")
        _installed(membership.company)

        product = Product.objects.filter(company=membership.company, pk=request.data.get("product_id")).first()
        if not product:
            raise not_found("Product not found.")

        variant = None
        variant_id = request.data.get("variant_id")
        if variant_id:
            variant = ProductVariant.objects.filter(company=membership.company, product=product, pk=variant_id).first()

        quantity_delta = int(request.data.get("quantity") or 0)
        movement_type = request.data.get("movement_type", MovementType.IN)
        notes = request.data.get("notes", "")

        movement = adjust_stock(
            company=membership.company,
            product=product,
            variant=variant,
            quantity_delta=quantity_delta,
            movement_type=movement_type,
            reference_type="manual_adjustment",
            notes=notes,
            actor=request.user,
        )

        return Response(
            {
                "id": str(movement.id),
                "product_name": product.name,
                "quantity": movement.quantity,
                "new_stock": movement.quantity_after,
            },
            status=201,
        )


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.orders", "commerce.view")
        _installed(membership.company)

        qs = Order.objects.filter(company=membership.company).select_related("party").order_by("-created_at")

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        party_id = request.query_params.get("party_id")
        if party_id:
            qs = qs.filter(party_id=party_id)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(order_number__icontains=search) | Q(party__display_name__icontains=search))

        results = [
            {
                "id": str(o.id),
                "order_number": o.order_number,
                "party": o.party.display_name,
                "party_id": str(o.party_id),
                "status": o.status,
                "payment_status": o.payment_status,
                "payment_method": o.payment_method,
                "subtotal_minor": o.subtotal_minor,
                "discount_minor": o.discount_minor,
                "tax_minor": o.tax_minor,
                "total_minor": o.total_minor,
                "currency": o.currency,
                "lines_count": o.lines.count(),
                "created_at": o.created_at.isoformat(),
            }
            for o in qs
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.create.orders", "commerce.manage")
        _installed(membership.company)

        party = Party.objects.filter(company=membership.company, pk=request.data.get("party_id")).first()
        if not party:
            raise not_found("Customer party was not found.")

        lines = request.data.get("lines") or []
        discount_code = request.data.get("discount_code", "")
        notes = request.data.get("notes", "")
        shipping = request.data.get("shipping_address", "")
        billing = request.data.get("billing_address", "")
        payment_method = request.data.get("payment_method", "cash_on_delivery")
        auto_confirm = bool(request.data.get("auto_confirm", False))

        order = create_order(
            company=membership.company,
            party=party,
            lines_data=lines,
            discount_code=discount_code,
            notes=notes,
            shipping_address=shipping,
            billing_address=billing,
            payment_method=payment_method,
            auto_confirm=auto_confirm,
            actor=request.user,
        )

        return Response(
            {
                "id": str(order.id),
                "order_number": order.order_number,
                "status": order.status,
                "payment_status": order.payment_status,
                "total_minor": order.total_minor,
            },
            status=201,
        )


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, order_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.orders", "commerce.view")
        _installed(membership.company)

        order = Order.objects.filter(company=membership.company, pk=order_id).select_related("party").first()
        if not order:
            raise not_found("Order not found.")

        lines = [
            {
                "id": str(line.id),
                "product_id": str(line.product_id),
                "product_name": line.product.name,
                "product_sku": line.product.sku,
                "variant_id": str(line.variant_id) if line.variant_id else None,
                "variant_name": line.variant.name if line.variant else None,
                "quantity": line.quantity,
                "unit_price_minor": line.unit_price_minor,
                "discount_minor": line.discount_minor,
                "tax_minor": line.tax_minor,
                "total_minor": line.total_minor,
                "notes": line.notes,
            }
            for line in order.lines.select_related("product", "variant").all()
        ]

        activities = [
            {
                "id": str(a.id),
                "action": a.action,
                "from_status": a.from_status,
                "to_status": a.to_status,
                "notes": a.notes,
                "actor_name": a.actor.get_full_name() or a.actor.email if a.actor else "System",
                "created_at": a.created_at.isoformat(),
            }
            for a in order.activities.select_related("actor").order_by("-created_at")
        ]

        returns = [
            {
                "id": str(r.id),
                "return_number": r.return_number,
                "status": r.status,
                "refund_status": r.refund_status,
                "refund_amount_minor": r.refund_amount_minor,
                "created_at": r.created_at.isoformat(),
            }
            for r in order.returns.order_by("-created_at")
        ]

        return Response(
            {
                "id": str(order.id),
                "order_number": order.order_number,
                "party": {
                    "id": str(order.party.id),
                    "display_name": order.party.display_name,
                    "kind": order.party.kind,
                    "email": order.party.email,
                    "phone": order.party.phone,
                },
                "status": order.status,
                "payment_status": order.payment_status,
                "payment_method": order.payment_method,
                "currency": order.currency,
                "subtotal_minor": order.subtotal_minor,
                "discount_code": order.discount_code,
                "discount_minor": order.discount_minor,
                "tax_minor": order.tax_minor,
                "total_minor": order.total_minor,
                "shipping_address": order.shipping_address,
                "billing_address": order.billing_address,
                "notes": order.notes,
                "confirmed_at": order.confirmed_at.isoformat() if order.confirmed_at else None,
                "shipped_at": order.shipped_at.isoformat() if order.shipped_at else None,
                "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
                "cancelled_at": order.cancelled_at.isoformat() if order.cancelled_at else None,
                "created_at": order.created_at.isoformat(),
                "lines": lines,
                "activities": activities,
                "returns": returns,
            }
        )

    def patch(self, request, company_id, order_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.update.orders", "commerce.manage")
        _installed(membership.company)

        order = Order.objects.filter(company=membership.company, pk=order_id).first()
        if not order:
            raise not_found("Order not found.")

        data = request.data
        if "notes" in data:
            order.notes = data["notes"]
        if "shipping_address" in data:
            order.shipping_address = data["shipping_address"]
        if "billing_address" in data:
            order.billing_address = data["billing_address"]
        if "payment_method" in data:
            order.payment_method = data["payment_method"]
        if "payment_status" in data and data["payment_status"] in PaymentStatus.values:
            order.payment_status = data["payment_status"]

        order.save()
        return Response({"id": str(order.id), "order_number": order.order_number, "status": order.status, "payment_status": order.payment_status})


class OrderStatusTransitionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, order_id):
        membership = _require_commerce_perm(
            request.user, company_id, "commerce.confirm.orders", "commerce.cancel.orders", "commerce.update.orders", "commerce.manage"
        )
        _installed(membership.company)

        order = Order.objects.filter(company=membership.company, pk=order_id).first()
        if not order:
            raise not_found("Order not found.")

        new_status = request.data.get("status")
        notes = request.data.get("notes", "")

        order = transition_order_status(order, new_status, actor=request.user, notes=notes)
        return Response({"id": str(order.id), "order_number": order.order_number, "status": order.status})


class CustomerListView(APIView):
    """
    Integrates directly with shared apps.parties.models.Party.
    ADR-020: Zero duplicate identity records.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.customers", "parties.view", "commerce.view")
        _installed(membership.company)

        search = (request.query_params.get("search") or "").strip()
        parties_qs = Party.objects.filter(company=membership.company)
        if search:
            parties_qs = parties_qs.filter(Q(display_name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search))

        revenue_statuses = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_SHIPMENT, OrderStatus.SHIPPED, OrderStatus.DELIVERED]

        parties_qs = parties_qs.annotate(
            orders_count=Count("commerce_orders"),
            total_spend=Sum("commerce_orders__total_minor", filter=Q(commerce_orders__status__in=revenue_statuses)),
        ).order_by("-total_spend", "display_name")

        results = [
            {
                "id": str(p.id),
                "display_name": p.display_name,
                "kind": p.kind,
                "email": p.email,
                "phone": p.phone,
                "status": p.status,
                "orders_count": p.orders_count,
                "total_spent_minor": p.total_spend or 0,
                "created_at": p.created_at.isoformat(),
            }
            for p in parties_qs
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.customers", "parties.manage", "commerce.manage")
        _installed(membership.company)

        name = (request.data.get("display_name") or request.data.get("name") or "").strip()
        if not name:
            raise validation_error([{"field": "display_name", "code": "required", "message": "Customer name is required."}])

        kind = request.data.get("kind", PartyKind.ORGANIZATION)
        if kind not in PartyKind.values:
            kind = PartyKind.ORGANIZATION

        party = Party.objects.create(
            company=membership.company,
            display_name=name[:255],
            kind=kind,
            email=request.data.get("email", "").strip()[:254],
            phone=request.data.get("phone", "").strip()[:64],
            status=PartyStatus.ACTIVE,
            custom_data=request.data.get("custom_data") or {"source": "commerce_module"},
        )

        return Response(
            {
                "id": str(party.id),
                "display_name": party.display_name,
                "kind": party.kind,
                "email": party.email,
                "phone": party.phone,
                "status": party.status,
            },
            status=201,
        )


class CustomerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, party_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.customers", "parties.view", "commerce.view")
        _installed(membership.company)

        party = Party.objects.filter(company=membership.company, pk=party_id).first()
        if not party:
            raise not_found("Customer not found.")

        revenue_statuses = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_SHIPMENT, OrderStatus.SHIPPED, OrderStatus.DELIVERED]
        orders = Order.objects.filter(company=membership.company, party=party).order_by("-created_at")

        total_spent = orders.filter(status__in=revenue_statuses).aggregate(s=Sum("total_minor"))["s"] or 0
        orders_count = orders.count()

        order_list = [
            {
                "id": str(o.id),
                "order_number": o.order_number,
                "status": o.status,
                "payment_status": o.payment_status,
                "total_minor": o.total_minor,
                "created_at": o.created_at.isoformat(),
            }
            for o in orders
        ]

        return Response(
            {
                "id": str(party.id),
                "display_name": party.display_name,
                "kind": party.kind,
                "email": party.email,
                "phone": party.phone,
                "status": party.status,
                "summary": {
                    "orders_count": orders_count,
                    "total_spent_minor": total_spent,
                    "average_order_value_minor": int(total_spent / orders_count) if orders_count else 0,
                },
                "orders": order_list,
            }
        )


class VendorListView(APIView):
    """
    Integrates directly with shared apps.parties.models.Party.
    ADR-020: Zero duplicate identity records.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.vendors", "parties.view", "commerce.view")
        _installed(membership.company)

        search = (request.query_params.get("search") or "").strip()
        parties_qs = Party.objects.filter(company=membership.company)
        if search:
            parties_qs = parties_qs.filter(Q(display_name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search))

        # Check supplied products count
        parties_qs = parties_qs.annotate(supplied_products_count=Count("supplied_products")).order_by("display_name")

        results = [
            {
                "id": str(p.id),
                "display_name": p.display_name,
                "kind": p.kind,
                "email": p.email,
                "phone": p.phone,
                "status": p.status,
                "supplied_products_count": p.supplied_products_count,
                "created_at": p.created_at.isoformat(),
            }
            for p in parties_qs
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.vendors", "parties.manage", "commerce.manage")
        _installed(membership.company)

        name = (request.data.get("display_name") or request.data.get("name") or "").strip()
        if not name:
            raise validation_error([{"field": "display_name", "code": "required", "message": "Vendor name is required."}])

        party = Party.objects.create(
            company=membership.company,
            display_name=name[:255],
            kind=PartyKind.ORGANIZATION,
            email=request.data.get("email", "").strip()[:254],
            phone=request.data.get("phone", "").strip()[:64],
            status=PartyStatus.ACTIVE,
            custom_data=request.data.get("custom_data") or {"role": "vendor", "category": request.data.get("category", "General")},
        )

        return Response(
            {
                "id": str(party.id),
                "display_name": party.display_name,
                "kind": party.kind,
                "email": party.email,
                "phone": party.phone,
                "status": party.status,
            },
            status=201,
        )


class VendorDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, party_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.vendors", "parties.view", "commerce.view")
        _installed(membership.company)

        party = Party.objects.filter(company=membership.company, pk=party_id).first()
        if not party:
            raise not_found("Vendor not found.")

        supplied_products = [
            {
                "id": str(p.id),
                "name": p.name,
                "sku": p.sku,
                "price_minor": p.price_minor,
                "cost_price_minor": p.cost_price_minor,
                "stock_quantity": p.stock_quantity,
            }
            for p in party.supplied_products.filter(status=ProductStatus.ACTIVE)
        ]

        return Response(
            {
                "id": str(party.id),
                "display_name": party.display_name,
                "kind": party.kind,
                "email": party.email,
                "phone": party.phone,
                "status": party.status,
                "custom_data": party.custom_data,
                "supplied_products": supplied_products,
            }
        )


class DiscountListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.discounts", "commerce.view")
        _installed(membership.company)

        discounts = Discount.objects.filter(company=membership.company).order_by("-created_at")

        results = [
            {
                "id": str(d.id),
                "name": d.name,
                "code": d.code,
                "discount_type": d.discount_type,
                "value": str(d.value),
                "min_order_amount_minor": d.min_order_amount_minor,
                "max_discount_amount_minor": d.max_discount_amount_minor,
                "applies_to": d.applies_to,
                "usage_limit": d.usage_limit,
                "usage_count": d.usage_count,
                "starts_at": d.starts_at.isoformat() if d.starts_at else None,
                "expires_at": d.expires_at.isoformat() if d.expires_at else None,
                "is_active": d.is_active,
            }
            for d in discounts
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.discounts", "commerce.manage")
        _installed(membership.company)

        name = (request.data.get("name") or "").strip()
        code = (request.data.get("code") or "").strip().upper()
        if not name or not code:
            raise validation_error([{"field": "name", "code": "required", "message": "Discount name and code are required."}])

        if Discount.objects.filter(company=membership.company, code=code).exists():
            raise conflict(f"Discount with code '{code}' already exists.")

        discount = Discount.objects.create(
            company=membership.company,
            name=name[:255],
            code=code[:64],
            discount_type=request.data.get("discount_type", DiscountType.PERCENTAGE),
            value=Decimal(str(request.data.get("value") or "0.00")),
            min_order_amount_minor=int(request.data.get("min_order_amount_minor") or 0),
            max_discount_amount_minor=int(request.data["max_discount_amount_minor"]) if request.data.get("max_discount_amount_minor") else None,
            applies_to=request.data.get("applies_to", DiscountAppliesTo.ALL_ORDERS),
            usage_limit=int(request.data["usage_limit"]) if request.data.get("usage_limit") else None,
            starts_at=request.data.get("starts_at") or None,
            expires_at=request.data.get("expires_at") or None,
            is_active=bool(request.data.get("is_active", True)),
        )

        return Response(
            {
                "id": str(discount.id),
                "name": discount.name,
                "code": discount.code,
                "value": str(discount.value),
            },
            status=201,
        )


class DiscountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, discount_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.discounts", "commerce.manage")
        _installed(membership.company)

        discount = Discount.objects.filter(company=membership.company, pk=discount_id).first()
        if not discount:
            raise not_found("Discount not found.")

        data = request.data
        if "name" in data:
            discount.name = data["name"][:255]
        if "value" in data:
            discount.value = Decimal(str(data["value"]))
        if "is_active" in data:
            discount.is_active = bool(data["is_active"])
        if "usage_limit" in data:
            discount.usage_limit = int(data["usage_limit"]) if data["usage_limit"] else None

        discount.save()
        return Response({"id": str(discount.id), "name": discount.name, "is_active": discount.is_active})

    def delete(self, request, company_id, discount_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.discounts", "commerce.manage")
        _installed(membership.company)

        discount = Discount.objects.filter(company=membership.company, pk=discount_id).first()
        if not discount:
            raise not_found("Discount not found.")
        discount.delete()
        return Response({"message": "Discount deleted."})


class DiscountValidateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.orders", "commerce.view")
        _installed(membership.company)

        code = (request.data.get("code") or "").strip()
        subtotal_minor = int(request.data.get("subtotal_minor") or 0)
        party = None
        if request.data.get("party_id"):
            party = Party.objects.filter(company=membership.company, pk=request.data["party_id"]).first()

        discount_obj, amount_minor = evaluate_discount(membership.company, code, subtotal_minor, party)
        return Response(
            {
                "valid": True,
                "code": discount_obj.code if discount_obj else "",
                "discount_minor": amount_minor,
                "name": discount_obj.name if discount_obj else "",
            }
        )


class ReturnListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.returns", "commerce.view")
        _installed(membership.company)

        qs = ReturnRequest.objects.filter(company=membership.company).select_related("order", "party").order_by("-created_at")

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        results = [
            {
                "id": str(r.id),
                "return_number": r.return_number,
                "order_id": str(r.order_id),
                "order_number": r.order.order_number,
                "party_id": str(r.party_id),
                "customer_name": r.party.display_name,
                "status": r.status,
                "refund_status": r.refund_status,
                "refund_amount_minor": r.refund_amount_minor,
                "reason": r.reason,
                "notes": r.notes,
                "created_at": r.created_at.isoformat(),
            }
            for r in qs
        ]
        return Response({"results": results})

    def post(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.returns", "commerce.manage")
        _installed(membership.company)

        order = Order.objects.filter(company=membership.company, pk=request.data.get("order_id")).first()
        if not order:
            raise not_found("Order not found.")

        reason = request.data.get("reason", ReturnReason.DEFECTIVE)
        lines = request.data.get("lines") or []
        notes = request.data.get("notes", "")

        return_obj = create_return_request(
            company=membership.company,
            order=order,
            reason=reason,
            lines_data=lines,
            notes=notes,
            actor=request.user,
        )

        return Response(
            {
                "id": str(return_obj.id),
                "return_number": return_obj.return_number,
                "status": return_obj.status,
                "refund_amount_minor": return_obj.refund_amount_minor,
            },
            status=201,
        )


class ReturnDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, return_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.returns", "commerce.view")
        _installed(membership.company)

        ret = ReturnRequest.objects.filter(company=membership.company, pk=return_id).select_related("order", "party").first()
        if not ret:
            raise not_found("Return request not found.")

        lines = [
            {
                "id": str(l.id),
                "product_id": str(l.product_id),
                "product_name": l.product.name,
                "product_sku": l.product.sku,
                "variant_name": l.variant.name if l.variant else None,
                "quantity": l.quantity,
                "refund_unit_price_minor": l.refund_unit_price_minor,
                "restock_inventory": l.restock_inventory,
            }
            for l in ret.lines.select_related("product", "variant").all()
        ]

        return Response(
            {
                "id": str(ret.id),
                "return_number": ret.return_number,
                "order_id": str(ret.order_id),
                "order_number": ret.order.order_number,
                "party_id": str(ret.party_id),
                "customer_name": ret.party.display_name,
                "status": ret.status,
                "refund_status": ret.refund_status,
                "refund_amount_minor": ret.refund_amount_minor,
                "reason": ret.reason,
                "notes": ret.notes,
                "lines": lines,
                "created_at": ret.created_at.isoformat(),
            }
        )

    def post(self, request, company_id, return_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.returns", "commerce.manage")
        _installed(membership.company)

        ret = ReturnRequest.objects.filter(company=membership.company, pk=return_id).first()
        if not ret:
            raise not_found("Return request not found.")

        action = request.data.get("action")
        notes = request.data.get("notes", "")

        ret = process_return_action(return_request=ret, action=action, actor=request.user, notes=notes)
        return Response({"id": str(ret.id), "return_number": ret.return_number, "status": ret.status, "refund_status": ret.refund_status})


class CommerceReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.view.reports", "commerce.view")
        _installed(membership.company)

        report_type = request.query_params.get("report_type", "sales")
        export = request.query_params.get("export")

        if export == "csv":
            csv_content = generate_commerce_report_csv(membership.company, report_type=report_type)
            response = HttpResponse(csv_content, content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="commerce_{report_type}_report.csv"'
            return response

        # Aggregate data payload for reports
        overview = get_commerce_overview_dashboard(membership.company, date_filter="all")
        return Response(
            {
                "report_type": report_type,
                "overview": overview,
                "generated_at": timezone.now().isoformat(),
            }
        )


class CommerceSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.settings", "commerce.view")
        _installed(membership.company)

        settings_obj = ensure_commerce_settings(membership.company)
        return Response(
            {
                "currency": settings_obj.currency,
                "currency_symbol": settings_obj.currency_symbol,
                "tax_rate": str(settings_obj.tax_rate),
                "tax_included_in_price": settings_obj.tax_included_in_price,
                "default_tax_classification": settings_obj.default_tax_classification,
                "order_number_prefix": settings_obj.order_number_prefix,
                "order_number_next": settings_obj.order_number_next,
                "return_number_prefix": settings_obj.return_number_prefix,
                "return_number_next": settings_obj.return_number_next,
                "default_low_stock_threshold": settings_obj.default_low_stock_threshold,
                "auto_deduct_inventory": settings_obj.auto_deduct_inventory,
                "allow_backorders": settings_obj.allow_backorders,
                "return_window_days": settings_obj.return_window_days,
                "enable_customer_notes": settings_obj.enable_customer_notes,
            }
        )

    def patch(self, request, company_id):
        membership = _require_commerce_perm(request.user, company_id, "commerce.manage.settings", "commerce.manage")
        _installed(membership.company)

        settings_obj = ensure_commerce_settings(membership.company)
        data = request.data

        if "currency" in data:
            settings_obj.currency = data["currency"][:3].upper()
        if "currency_symbol" in data:
            settings_obj.currency_symbol = data["currency_symbol"][:8]
        if "tax_rate" in data:
            settings_obj.tax_rate = Decimal(str(data["tax_rate"]))
        if "tax_included_in_price" in data:
            settings_obj.tax_included_in_price = bool(data["tax_included_in_price"])
        if "order_number_prefix" in data:
            settings_obj.order_number_prefix = data["order_number_prefix"][:16]
        if "return_number_prefix" in data:
            settings_obj.return_number_prefix = data["return_number_prefix"][:16]
        if "default_low_stock_threshold" in data:
            settings_obj.default_low_stock_threshold = max(0, int(data["default_low_stock_threshold"]))
        if "auto_deduct_inventory" in data:
            settings_obj.auto_deduct_inventory = bool(data["auto_deduct_inventory"])
        if "allow_backorders" in data:
            settings_obj.allow_backorders = bool(data["allow_backorders"])
        if "return_window_days" in data:
            settings_obj.return_window_days = max(1, int(data["return_window_days"]))

        settings_obj.save()
        return Response({"message": "Commerce settings updated successfully."})
