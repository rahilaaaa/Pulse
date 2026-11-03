from decimal import Decimal

from apps.audit.models import AuditLog
from apps.commerce.models import (
    Category,
    CategoryStatus,
    CommerceSettings,
    PriceList,
    Product,
    ProductStatus,
    ProductType,
)
from apps.commerce.services import ensure_commerce_settings


def on_install(*, company, user):
    """
    Called when Commerce module is installed for a company.
    Idempotently sets up default configuration, settings, categories, and audit log.
    """
    settings_obj = ensure_commerce_settings(company)

    # Initialize starter categories if none exist
    if not Category.objects.filter(company=company).exists():
        cat_lifestyle = Category.objects.create(
            company=company,
            name="Home & Lifestyle",
            slug="home-lifestyle",
            code="CAT-LIFE",
            description="Specialty home accents, lighting, decor, and living essentials.",
            status=CategoryStatus.ACTIVE,
            display_order=1,
        )
        cat_apparel = Category.objects.create(
            company=company,
            name="Apparel & Textiles",
            slug="apparel-textiles",
            code="CAT-APP",
            description="Curated handcrafted textiles, accessories, and garments.",
            status=CategoryStatus.ACTIVE,
            display_order=2,
        )
        cat_general = Category.objects.create(
            company=company,
            name="General Merchandise",
            slug="general",
            code="CAT-GEN",
            description="General merchandise and consumables.",
            status=CategoryStatus.ACTIVE,
            display_order=3,
        )
    else:
        cat_lifestyle = Category.objects.filter(company=company).first()

    # Initialize default price list if none exists
    if not PriceList.objects.filter(company=company).exists():
        PriceList.objects.create(
            company=company,
            name="Standard Retail",
            code="PL-RETAIL",
            description="Default standard retail price list for all customer transactions.",
            currency=settings_obj.currency,
            is_default=True,
            status=CategoryStatus.ACTIVE,
        )

    # If company has 0 products, seed an initial sample product
    if not Product.objects.filter(company=company).exists():
        Product.objects.create(
            company=company,
            category=cat_lifestyle,
            name="Handcrafted Ceramic Vase",
            sku="LIFESTYLE-VASE-01",
            barcode="8901234560012",
            description="Artisan glazed earthenware vase designed for modern living spaces.",
            product_type=ProductType.SIMPLE,
            price_minor=249900,  # ₹2,499.00
            cost_price_minor=120000,  # ₹1,200.00
            tax_rate=Decimal("18.00"),
            tax_classification="standard",
            uom="pcs",
            status=ProductStatus.ACTIVE,
            stock_quantity=45,
            reserved_quantity=0,
            low_stock_threshold=10,
            track_inventory=True,
        )

    AuditLog.objects.create(
        company=company,
        actor=user,
        action="commerce.module_installed",
        object_type="module",
        object_id=company.id,
        after={"module": "commerce", "version": "2.0.0"},
    )
    return None


def on_uninstall(*, company, user):
    """
    Called when Commerce module is uninstalled.
    Preserves all historical product catalog, sales orders, price lists, and customer records per ADR-011 and ADR-016.
    """
    AuditLog.objects.create(
        company=company,
        actor=user,
        action="commerce.module_uninstalled",
        object_type="module",
        object_id=company.id,
        after={"module": "commerce", "data_preserved": True},
    )
    return None
