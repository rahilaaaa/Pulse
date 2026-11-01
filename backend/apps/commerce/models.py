import uuid

from django.db import models


class ProductStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class OrderStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PLACED = "placed", "Placed"
    CANCELLED = "cancelled", "Cancelled"


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_products")
    name = models.CharField(max_length=255)
    sku = models.SlugField(max_length=64)
    price_minor = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=32, choices=ProductStatus.choices, default=ProductStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_products"
        constraints = [
            models.UniqueConstraint(fields=["company", "sku"], name="commerce_products_company_sku_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="commerce_products_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in ProductStatus]),
                name="commerce_products_status_valid",
            ),
        ]


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_orders")
    party = models.ForeignKey("parties.Party", on_delete=models.PROTECT, related_name="commerce_orders")
    status = models.CharField(max_length=32, choices=OrderStatus.choices, default=OrderStatus.DRAFT)
    currency = models.CharField(max_length=3, default="INR")
    total_minor = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "commerce_orders"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_orders_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in OrderStatus]),
                name="commerce_orders_status_valid",
            ),
        ]


class OrderLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="commerce_order_lines")
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="order_lines")
    quantity = models.PositiveIntegerField(default=1)
    unit_price_minor = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "commerce_order_lines"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="commerce_order_lines_company_id_id_unique"),
        ]
