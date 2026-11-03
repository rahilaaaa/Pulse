import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class ProductStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DRAFT = "draft", "Draft"
    ARCHIVED = "archived", "Archived"


class ProductType(models.TextChoices):
    SIMPLE = "simple", "Simple Product"
    VARIANT = "variant", "Product with Variants"
    SERVICE = "service", "Service"
    DIGITAL = "digital", "Digital Product"


class CategoryStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class OrderStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PLACED = "placed", "Placed"
    CONFIRMED = "confirmed", "Confirmed"
    PROCESSING = "processing", "Processing"
    READY_FOR_SHIPMENT = "ready_for_shipment", "Ready for Shipment"
    SHIPPED = "shipped", "Shipped"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"
    RETURNED = "returned", "Returned"


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PARTIALLY_PAID = "partially_paid", "Partially Paid"
    PAID = "paid", "Paid"
    REFUNDED = "refunded", "Refunded"
    FAILED = "failed", "Failed"


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Cash"
    BANK_TRANSFER = "bank_transfer", "Bank Transfer"
    CREDIT_CARD = "credit_card", "Credit Card"
    UPI = "upi", "UPI / QR"
    CREDIT_TERMS = "credit_terms", "Net 30 / Credit Terms"


class ReturnStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    APPROVED = "approved", "Approved"
    RECEIVED = "received", "Received"
    COMPLETED = "completed", "Completed"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


class RefundStatus(models.TextChoices):
    NOT_APPLICABLE = "not_applicable", "Not Applicable"
    PENDING = "pending", "Pending"
    REFUNDED = "refunded", "Refunded"
    REJECTED = "rejected", "Rejected"


class ReturnReason(models.TextChoices):
    DEFECTIVE = "defective", "Defective or Damaged"
    WRONG_ITEM = "wrong_item", "Wrong Item Received"
    NOT_AS_DESCRIBED = "not_as_described", "Not as Described"
    DAMAGED_IN_TRANSIT = "damaged_in_transit", "Damaged in Transit"
    CUSTOMER_CANCELLED = "customer_cancelled", "Customer Cancelled"
    OTHER = "other", "Other"


class DiscountType(models.TextChoices):
    PERCENTAGE = "percentage", "Percentage Discount"
    FIXED_AMOUNT = "fixed_amount", "Fixed Amount Discount"


class DiscountAppliesTo(models.TextChoices):
    ALL_ORDERS = "all_orders", "All Orders"
    SPECIFIC_PRODUCTS = "specific_products", "Specific Products"
    SPECIFIC_CATEGORIES = "specific_categories", "Specific Categories"
    SPECIFIC_CUSTOMERS = "specific_customers", "Specific Customers"


class MovementType(models.TextChoices):
    IN = "in", "Stock In"
    OUT = "out", "Stock Out"
    ADJUSTMENT = "adjustment", "Manual Adjustment"
    RESERVATION = "reservation", "Order Reservation"
    FULFILLMENT = "fulfillment", "Order Fulfillment"
    RETURN_RESTOCK = "return_restock", "Return Restock"


class CommerceSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.OneToOneField("tenants.Company", on_delete=models.CASCADE, related_name="commerce_settings")
    currency = models.CharField(max_length=3, default="INR")
    currency_symbol = models.CharField(max_length=8, default="₹")
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18.00"))
    tax_included_in_price = models.BooleanField(default=False)
    default_tax_classification = models.CharField(max_length=32, default="standard")
    order_number_prefix = models.CharField(max_length=16, default="ORD-")
    order_number_next = models.PositiveIntegerField(default=1001)
    return_number_prefix = models.CharField(max_length=16, default="RET-")
    return_number_next = models.PositiveIntegerField(default=101)
    default_low_stock_threshold = models.PositiveIntegerField(default=5)
    auto_deduct_inventory = models.BooleanField(default=True)
    allow_backorders = models.BooleanField(default=False)
    return_window_days = models.PositiveIntegerField(default=30)
    enable_customer_notes = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_settings"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_settings_company_id_id_unique"),
        ]


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_categories")
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100)
    code = models.CharField(max_length=64, blank=True, default="")
    description = models.TextField(blank=True, default="")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children")
    status = models.CharField(max_length=32, choices=CategoryStatus.choices, default=CategoryStatus.ACTIVE)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_categories"
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["company", "slug"], name="commerce_categories_company_slug_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_categories_company_id_id_unique"),
        ]

    def __str__(self):
        return self.name


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_products")
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="products")
    vendor = models.ForeignKey("parties.Party", null=True, blank=True, on_delete=models.SET_NULL, related_name="supplied_products")
    name = models.CharField(max_length=255)
    sku = models.SlugField(max_length=64)
    description = models.TextField(blank=True, default="")
    image_url = models.URLField(max_length=500, blank=True, default="")
    product_type = models.CharField(max_length=32, choices=ProductType.choices, default=ProductType.SIMPLE)
    barcode = models.CharField(max_length=64, blank=True, default="")
    price_minor = models.PositiveIntegerField(default=0)  # Selling price
    cost_price_minor = models.PositiveIntegerField(default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_classification = models.CharField(max_length=32, default="standard")
    uom = models.CharField(max_length=32, default="pcs")
    status = models.CharField(max_length=32, choices=ProductStatus.choices, default=ProductStatus.ACTIVE)
    stock_quantity = models.IntegerField(default=0)
    reserved_quantity = models.IntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    track_inventory = models.BooleanField(default=True)
    attributes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def available_stock(self) -> int:
        return max(0, self.stock_quantity - self.reserved_quantity)

    @property
    def is_low_stock(self) -> bool:
        return self.track_inventory and self.available_stock <= self.low_stock_threshold

    class Meta:
        db_table = "commerce_products"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["company", "sku"], name="commerce_products_company_sku_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_products_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in ProductStatus]),
                name="commerce_products_status_valid",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class ProductVariant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_product_variants")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=255)
    sku = models.SlugField(max_length=64)
    barcode = models.CharField(max_length=64, blank=True, default="")
    price_minor = models.PositiveIntegerField(default=0)
    cost_price_minor = models.PositiveIntegerField(default=0)
    stock_quantity = models.IntegerField(default=0)
    reserved_quantity = models.IntegerField(default=0)
    attributes = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=32, choices=ProductStatus.choices, default=ProductStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def available_stock(self) -> int:
        return max(0, self.stock_quantity - self.reserved_quantity)

    class Meta:
        db_table = "commerce_product_variants"
        ordering = ["sku"]
        constraints = [
            models.UniqueConstraint(fields=["company", "sku"], name="commerce_variants_company_sku_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_variants_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.product.name} - {self.name} ({self.sku})"


class PriceList(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_price_lists")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64)
    description = models.TextField(blank=True, default="")
    currency = models.CharField(max_length=3, default="INR")
    is_default = models.BooleanField(default=False)
    customer_party = models.ForeignKey(
        "parties.Party", null=True, blank=True, on_delete=models.CASCADE, related_name="commerce_price_lists"
    )
    party_kind = models.CharField(max_length=32, default="all")  # all, person, organization
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=32, choices=CategoryStatus.choices, default=CategoryStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_price_lists"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="commerce_price_lists_company_code_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_price_lists_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class PriceListItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_price_list_items")
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="price_list_items")
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.CASCADE, related_name="price_list_items")
    min_quantity = models.PositiveIntegerField(default=1)
    price_minor = models.PositiveIntegerField(default=0)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commerce_price_list_items"
        constraints = [
            models.UniqueConstraint(fields=["price_list", "product", "variant", "min_quantity"], name="commerce_pli_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_pli_company_id_id_unique"),
        ]


class Discount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_discounts")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64)
    discount_type = models.CharField(max_length=32, choices=DiscountType.choices, default=DiscountType.PERCENTAGE)
    value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    min_order_amount_minor = models.PositiveIntegerField(default=0)
    max_discount_amount_minor = models.PositiveIntegerField(null=True, blank=True)
    applies_to = models.CharField(max_length=32, choices=DiscountAppliesTo.choices, default=DiscountAppliesTo.ALL_ORDERS)
    products = models.ManyToManyField(Product, blank=True, related_name="discounts")
    categories = models.ManyToManyField(Category, blank=True, related_name="discounts")
    customers = models.ManyToManyField("parties.Party", blank=True, related_name="commerce_discounts")
    starts_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    usage_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_discounts"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="commerce_discounts_company_code_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_discounts_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.name} [{self.code}]"


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_orders")
    order_number = models.CharField(max_length=64, blank=True, default="")
    party = models.ForeignKey("parties.Party", on_delete=models.PROTECT, related_name="commerce_orders")
    status = models.CharField(max_length=32, choices=OrderStatus.choices, default=OrderStatus.DRAFT)
    payment_status = models.CharField(max_length=32, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    payment_method = models.CharField(max_length=64, blank=True, default="cash_on_delivery")
    currency = models.CharField(max_length=3, default="INR")
    subtotal_minor = models.PositiveIntegerField(default=0)
    discount_minor = models.PositiveIntegerField(default=0)
    discount_code = models.CharField(max_length=64, blank=True, default="")
    tax_minor = models.PositiveIntegerField(default=0)
    total_minor = models.PositiveIntegerField(default=0)
    shipping_address = models.TextField(blank=True, default="")
    billing_address = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    placed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="commerce_orders_placed")
    confirmed_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_orders"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_orders_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in OrderStatus]),
                name="commerce_orders_status_valid",
            ),
        ]

    def __str__(self):
        return f"{self.order_number or self.id} - {self.party.display_name} ({self.status})"


class OrderLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_order_lines")
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_lines")
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines")
    quantity = models.PositiveIntegerField(default=1)
    unit_price_minor = models.PositiveIntegerField(default=0)
    discount_minor = models.PositiveIntegerField(default=0)
    tax_minor = models.PositiveIntegerField(default=0)
    total_minor = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commerce_order_lines"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_order_lines_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"


class OrderActivity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_order_activities")
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=64)
    from_status = models.CharField(max_length=32, blank=True, default="")
    to_status = models.CharField(max_length=32, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commerce_order_activities"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_order_activities_company_id_id_unique"),
        ]


class StockMovement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_stock_movements")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="stock_movements")
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_movements")
    movement_type = models.CharField(max_length=32, choices=MovementType.choices)
    quantity = models.IntegerField()  # Positive for additions, negative for reductions
    quantity_before = models.IntegerField(default=0)
    quantity_after = models.IntegerField(default=0)
    reference_type = models.CharField(max_length=64, blank=True, default="")  # e.g. "order", "return", "manual"
    reference_id = models.CharField(max_length=64, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commerce_stock_movements"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_stock_movements_company_id_id_unique"),
        ]


class ReturnRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_returns")
    return_number = models.CharField(max_length=64)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="returns")
    party = models.ForeignKey("parties.Party", on_delete=models.PROTECT, related_name="commerce_returns")
    status = models.CharField(max_length=32, choices=ReturnStatus.choices, default=ReturnStatus.REQUESTED)
    refund_status = models.CharField(max_length=32, choices=RefundStatus.choices, default=RefundStatus.PENDING)
    refund_amount_minor = models.PositiveIntegerField(default=0)
    reason = models.CharField(max_length=64, choices=ReturnReason.choices, default=ReturnReason.DEFECTIVE)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="commerce_returns_created")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="commerce_returns_approved")
    approved_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_returns"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["company", "return_number"], name="commerce_returns_company_num_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_returns_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.return_number} - {self.party.display_name} ({self.status})"


class ReturnLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_return_lines")
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="lines")
    order_line = models.ForeignKey(OrderLine, on_delete=models.PROTECT, related_name="return_lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    variant = models.ForeignKey(ProductVariant, null=True, blank=True, on_delete=models.SET_NULL)
    quantity = models.PositiveIntegerField(default=1)
    refund_unit_price_minor = models.PositiveIntegerField(default=0)
    restock_inventory = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commerce_return_lines"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_return_lines_company_id_id_unique"),
        ]
