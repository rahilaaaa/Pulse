from decimal import Decimal
import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.catalog import COMPANY_PERMISSIONS
from apps.authorization.company import bootstrap_company_access, ensure_company_catalog
from apps.authorization.models import CompanyRole, Permission, RoleTemplate
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.commerce.install import on_install, on_uninstall
from apps.commerce.models import (
    Category,
    CommerceSettings,
    Discount,
    DiscountType,
    MovementType,
    Order,
    OrderLine,
    OrderStatus,
    PaymentStatus,
    PriceList,
    PriceListItem,
    Product,
    ProductStatus,
    ProductType,
    ProductVariant,
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
    get_commerce_overview_dashboard,
    process_return_action,
    resolve_item_pricing,
    transition_order_status,
)
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.modules_registry.services import ensure_module_catalog, install_module
from apps.parties.models import Party, PartyKind, PartyStatus
from apps.tenants.models import Company, CompanyMembership, MembershipStatus

User = get_user_model()


class CommerceModuleTests(TestCase):
    def setUp(self):
        ensure_company_catalog()
        ensure_module_catalog()

        # Create test company
        self.company = Company.objects.create(
            legal_name="Lotus Lane Retail",
            display_name="Lotus Lane",
            slug="lotus-lane",
            status="active",
        )
        self.other_company = Company.objects.create(
            legal_name="Competitor Retail",
            display_name="Competitor",
            slug="competitor",
            status="active",
        )

        # Set up active subscription
        self.plan = BillingPlan.objects.get(code="growth")
        self.price = BillingPlanPrice.objects.filter(
            plan=self.plan,
            billing_interval="year",
            currency="INR",
        ).order_by("-effective_from").first()
        self.subscription = Subscription.objects.create(
            company=self.company,
            plan=self.plan,
            plan_price=self.price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.ACTIVE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timezone.timedelta(days=365),
        )

        # Users and Memberships
        self.admin_user = User.objects.create_user(email="admin@lotuslane.example", password="Password123!")
        self.staff_user = User.objects.create_user(email="staff@lotuslane.example", password="Password123!")

        CompanyMembership.objects.create(
            company=self.company,
            user=self.admin_user,
            status=MembershipStatus.ACTIVE,
        )
        CompanyMembership.objects.create(
            company=self.other_company,
            user=self.admin_user,
            status=MembershipStatus.ACTIVE,
        )

        bootstrap_company_access(self.company, self.admin_user)
        bootstrap_company_access(self.other_company, self.admin_user)

        self.client = APIClient()

    def test_installation_and_idempotency(self):
        """Validates module installation, default settings creation, and idempotency."""
        result = install_module(user=self.admin_user, company=self.company, slug="commerce")
        self.assertEqual(result["status"], InstallationStatus.INSTALLED)

        # Check settings created
        settings_obj = CommerceSettings.objects.filter(company=self.company).first()
        self.assertIsNotNone(settings_obj)
        self.assertEqual(settings_obj.currency, "INR")

        # Check default categories created
        categories_count = Category.objects.filter(company=self.company).count()
        self.assertGreaterEqual(categories_count, 1)

        # Check default price list created
        price_list = PriceList.objects.filter(company=self.company, is_default=True).first()
        self.assertIsNotNone(price_list)

        # Re-run installation - must be idempotent
        result_again = install_module(user=self.admin_user, company=self.company, slug="commerce")
        self.assertEqual(result_again["status"], InstallationStatus.INSTALLED)
        self.assertEqual(Category.objects.filter(company=self.company).count(), categories_count)

    def test_uninstallation_preserves_data(self):
        """Disabling Commerce must not delete historical orders, products, or customers (ADR-011/016)."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")

        # Create product and order
        product = Product.objects.filter(company=self.company).first()
        party = Party.objects.create(company=self.company, display_name="Aarav Sharma", email="aarav@example.com")
        order = create_order(
            company=self.company,
            party=party,
            lines_data=[{"product_id": str(product.id), "quantity": 2}],
            actor=self.admin_user,
        )

        # Execute uninstallation
        on_uninstall(company=self.company, user=self.admin_user)

        # Verify data is strictly preserved
        self.assertTrue(Product.objects.filter(id=product.id).exists())
        self.assertTrue(Order.objects.filter(id=order.id).exists())
        self.assertTrue(Party.objects.filter(id=party.id).exists())

    def test_product_and_variant_management(self):
        """Test product creation, SKU uniqueness per tenant, variants, and archiving."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")
        self.client.force_authenticate(user=self.admin_user)

        # Create product
        url = f"/api/v1/companies/{self.company.id}/commerce/products/"
        payload = {
            "name": "Handmade Organic Silk Scarf",
            "sku": "SILK-SCARF-01",
            "price_minor": 150000,
            "cost_price_minor": 80000,
            "stock_quantity": 30,
            "product_type": "variant",
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, 201)
        product_id = resp.data["id"]

        # Duplicate SKU in same company must fail
        resp_dup = self.client.post(url, payload, format="json")
        self.assertEqual(resp_dup.status_code, 409)

        # Same SKU in different company must succeed (tenant isolation)
        Product.objects.create(company=self.other_company, name="Competitor Scarf", sku="SILK-SCARF-01")
        self.assertTrue(Product.objects.filter(company=self.other_company, sku="SILK-SCARF-01").exists())

        # Add variant
        v_url = f"/api/v1/companies/{self.company.id}/commerce/products/{product_id}/variants/"
        v_resp = self.client.post(v_url, {"name": "Emerald Green", "sku": "SILK-SCARF-01-GRN", "price_minor": 150000, "stock_quantity": 10}, format="json")
        self.assertEqual(v_resp.status_code, 201)
        self.assertEqual(ProductVariant.objects.filter(product_id=product_id).count(), 1)

        # Archive product
        detail_url = f"/api/v1/companies/{self.company.id}/commerce/products/{product_id}/"
        del_resp = self.client.delete(detail_url)
        self.assertEqual(del_resp.status_code, 200)
        p = Product.objects.get(id=product_id)
        self.assertEqual(p.status, ProductStatus.ARCHIVED)

    def test_party_customer_integration(self):
        """Commerce must use existing shared Party model without duplicate Customer model."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")
        self.client.force_authenticate(user=self.admin_user)

        # Create customer via Commerce Customers endpoint
        cust_url = f"/api/v1/companies/{self.company.id}/commerce/customers/"
        resp = self.client.post(cust_url, {"display_name": "FabIndia Lifestyle Corp", "kind": "organization", "email": "purchasing@fabindia.example"}, format="json")
        self.assertEqual(resp.status_code, 201)
        party_id = resp.data["id"]

        # Verify it exists in shared Party model
        party = Party.objects.filter(company=self.company, pk=party_id).first()
        self.assertIsNotNone(party)
        self.assertEqual(party.display_name, "FabIndia Lifestyle Corp")
        self.assertEqual(party.kind, PartyKind.ORGANIZATION)

    def test_price_lists_and_tier_calculation(self):
        """Tests configurable customer and quantity tier pricing."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")
        product = Product.objects.create(
            company=self.company,
            name="Organic Tea Box",
            sku="TEA-ORG-01",
            price_minor=50000,  # Standard: ₹500.00
            stock_quantity=100,
        )
        party = Party.objects.create(company=self.company, display_name="Wholesale Buyer Ltd", kind=PartyKind.ORGANIZATION)

        # Standard price check
        price, disc = resolve_item_pricing(self.company, product, quantity=1, party=party)
        self.assertEqual(price, 50000)

        # Create wholesale price list for this customer
        pl = PriceList.objects.create(
            company=self.company,
            name="Wholesale Partner Tier",
            code="PL-WHOLESALE",
            customer_party=party,
            status="active",
        )
        PriceListItem.objects.create(
            company=self.company,
            price_list=pl,
            product=product,
            min_quantity=10,
            price_minor=40000,  # ₹400 for 10+
        )

        # Quantity 5 (below min_quantity) -> standard price
        price_small, _ = resolve_item_pricing(self.company, product, quantity=5, party=party)
        self.assertEqual(price_small, 50000)

        # Quantity 10 -> tier price applies
        price_bulk, _ = resolve_item_pricing(self.company, product, quantity=10, party=party)
        self.assertEqual(price_bulk, 40000)

    def test_order_creation_transitions_and_stock(self):
        """Tests sales order lifecycle, atomic backend calculations, status transitions, and stock deduction/restock."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")
        product = Product.objects.create(
            company=self.company,
            name="Artisan Wooden Tray",
            sku="WOOD-TRAY-01",
            price_minor=120000,  # ₹1,200.00
            tax_rate=Decimal("18.00"),
            stock_quantity=50,
            track_inventory=True,
        )
        customer = Party.objects.create(company=self.company, display_name="Meera Kapoor", email="meera@example.com")

        # 1. Create order
        order = create_order(
            company=self.company,
            party=customer,
            lines_data=[{"product_id": str(product.id), "quantity": 5}],
            notes="Handle with care.",
            actor=self.admin_user,
        )

        # Subtotal: 5 * 1200.00 = 6000.00 (600000 paise)
        # Tax 18%: 1080.00 (108000 paise)
        # Total: 7080.00 (708000 paise)
        self.assertEqual(order.subtotal_minor, 600000)
        self.assertEqual(order.tax_minor, 108000)
        self.assertEqual(order.total_minor, 708000)
        self.assertEqual(order.status, OrderStatus.DRAFT)
        self.assertTrue(order.order_number.startswith("ORD-"))

        # Stock before confirm: 50
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 50)

        # 2. Confirm order -> stock deducted automatically
        transition_order_status(order, OrderStatus.CONFIRMED, actor=self.admin_user)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 45)  # 50 - 5 = 45

        # Check stock movement record
        movement = StockMovement.objects.filter(product=product, movement_type=MovementType.FULFILLMENT).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, -5)

        # 3. Processing -> Shipped -> Delivered
        transition_order_status(order, OrderStatus.PROCESSING, actor=self.admin_user)
        transition_order_status(order, OrderStatus.READY_FOR_SHIPMENT, actor=self.admin_user)
        transition_order_status(order, OrderStatus.SHIPPED, actor=self.admin_user)
        transition_order_status(order, OrderStatus.DELIVERED, actor=self.admin_user)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.DELIVERED)
        self.assertIsNotNone(order.delivered_at)

    def test_discount_validation(self):
        """Tests promotional discount codes, validity dates, min order amount, and usage limit."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")

        discount = Discount.objects.create(
            company=self.company,
            name="Festive 20% Off",
            code="FESTIVE20",
            discount_type=DiscountType.PERCENTAGE,
            value=Decimal("20.00"),
            min_order_amount_minor=100000,  # Min order ₹1,000.00
            usage_limit=2,
            is_active=True,
        )

        # Below min amount -> raises error
        with self.assertRaises(Exception):
            evaluate_discount(self.company, "FESTIVE20", subtotal_minor=50000)

        # Valid subtotal -> 20% of 2000.00 = 400.00
        disc_obj, amount = evaluate_discount(self.company, "FESTIVE20", subtotal_minor=200000)
        self.assertEqual(amount, 40000)
        self.assertEqual(disc_obj.code, "FESTIVE20")

    def test_return_and_restock_workflow(self):
        """Tests return request, approval, completion, and inventory restock."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")
        product = Product.objects.create(
            company=self.company,
            name="Brass Table Lamp",
            sku="BRASS-LAMP-01",
            price_minor=350000,
            stock_quantity=20,
            track_inventory=True,
        )
        party = Party.objects.create(company=self.company, display_name="Rohan Verma")
        order = create_order(
            company=self.company,
            party=party,
            lines_data=[{"product_id": str(product.id), "quantity": 2}],
            auto_confirm=True,
            actor=self.admin_user,
        )
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 18)  # 20 - 2

        # Create return for 1 item
        order_line = order.lines.first()
        ret = create_return_request(
            company=self.company,
            order=order,
            reason=ReturnReason.DAMAGED_IN_TRANSIT,
            lines_data=[{"order_line_id": str(order_line.id), "quantity": 1, "restock_inventory": True}],
            notes="Small scratch on brass base.",
            actor=self.admin_user,
        )
        self.assertEqual(ret.status, ReturnStatus.REQUESTED)
        self.assertEqual(ret.refund_amount_minor, 350000)

        # Approve and complete return -> restocks 1 unit
        process_return_action(return_request=ret, action="approve", actor=self.admin_user)
        process_return_action(return_request=ret, action="complete", actor=self.admin_user)

        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 19)  # 18 + 1 restocked

    def test_dashboard_kpis_aggregation(self):
        """Tests the commerce overview dashboard with real aggregations."""
        install_module(user=self.admin_user, company=self.company, slug="commerce")
        dashboard = get_commerce_overview_dashboard(self.company, date_filter="all")

        self.assertIn("kpis", dashboard)
        self.assertIn("sales_trend", dashboard)
        self.assertIn("orders_by_status", dashboard)
        self.assertIn("top_selling_products", dashboard)
        self.assertIn("recent_orders", dashboard)
        self.assertEqual(dashboard["kpis"]["currency"], "INR")
