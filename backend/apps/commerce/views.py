from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import require_permission
from apps.commerce.models import Order, OrderLine, OrderStatus, Product
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.parties.models import Party
from common.api.errors import not_found, validation_error


def _installed(company):
    if not CompanyModuleInstallation.objects.filter(
        company=company, module_id="commerce", status=InstallationStatus.INSTALLED
    ).exists():
        raise not_found("Commerce is not installed.")


class ProductListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "commerce.view")
        _installed(membership.company)
        rows = Product.objects.filter(company=membership.company).order_by("name")
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "name": row.name,
                        "sku": row.sku,
                        "price_minor": row.price_minor,
                        "status": row.status,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "commerce.manage")
        _installed(membership.company)
        name = (request.data.get("name") or "").strip()
        sku = (request.data.get("sku") or "").strip()
        if not name or not sku:
            raise validation_error(
                [
                    {"field": "name", "code": "required", "message": "Enter a product name and SKU."},
                ]
            )
        row = Product.objects.create(
            company=membership.company,
            name=name[:255],
            sku=sku[:64],
            price_minor=int(request.data.get("price_minor") or 0),
        )
        return Response({"id": str(row.id), "name": row.name, "sku": row.sku, "price_minor": row.price_minor}, status=201)


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "commerce.view")
        _installed(membership.company)
        rows = Order.objects.filter(company=membership.company).select_related("party").order_by("-created_at")
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "party": row.party.display_name,
                        "party_id": str(row.party_id),
                        "status": row.status,
                        "total_minor": row.total_minor,
                        "currency": row.currency,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "commerce.manage")
        _installed(membership.company)
        party = Party.objects.filter(company=membership.company, pk=request.data.get("party_id")).first()
        if party is None:
            raise not_found("That party was not found.")
        lines = request.data.get("lines") or []
        if not isinstance(lines, list) or not lines:
            raise validation_error([{"field": "lines", "code": "required", "message": "Add at least one line."}])
        with transaction.atomic():
            order = Order.objects.create(company=membership.company, party=party, status=OrderStatus.PLACED)
            total = 0
            for item in lines:
                product = Product.objects.filter(company=membership.company, pk=item.get("product_id")).first()
                if product is None:
                    raise not_found("A product on the order was not found.")
                qty = max(1, int(item.get("quantity") or 1))
                OrderLine.objects.create(
                    company=membership.company,
                    order=order,
                    product=product,
                    quantity=qty,
                    unit_price_minor=product.price_minor,
                )
                total += product.price_minor * qty
            order.total_minor = total
            order.save(update_fields=["total_minor", "updated_at"])
        return Response({"id": str(order.id), "status": order.status, "total_minor": order.total_minor}, status=201)
