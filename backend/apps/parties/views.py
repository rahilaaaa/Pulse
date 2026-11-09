from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import require_permission
from apps.parties.models import Party, PartyKind, PartyStatus
from common.api.errors import not_found, validation_error


def _serialize(row: Party) -> dict:
    return {
        "id": str(row.id),
        "kind": row.kind,
        "display_name": row.display_name,
        "email": row.email,
        "phone": row.phone,
        "status": row.status,
    }


class PartyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "parties.view")
        rows = Party.objects.filter(company=membership.company).order_by("display_name")
        return Response({"results": [_serialize(row) for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "parties.manage")
        name = (request.data.get("display_name") or "").strip()
        if not name:
            raise validation_error([{"field": "display_name", "code": "required", "message": "Enter a name."}])
        kind = request.data.get("kind") or PartyKind.ORGANIZATION
        if kind not in {choice.value for choice in PartyKind}:
            raise validation_error([{"field": "kind", "code": "invalid", "message": "Choose person or organization."}])
        row = Party.objects.create(
            company=membership.company,
            kind=kind,
            display_name=name[:255],
            email=(request.data.get("email") or "")[:254],
            phone=(request.data.get("phone") or "")[:64],
        )
        return Response(_serialize(row), status=201)


class PartyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, party_id):
        membership = require_permission(request.user, company_id, "parties.view")
        row = Party.objects.filter(company=membership.company, pk=party_id).first()
        if row is None:
            raise not_found()
        return Response(_serialize(row))

    def patch(self, request, company_id, party_id):
        membership = require_permission(request.user, company_id, "parties.manage")
        row = Party.objects.filter(company=membership.company, pk=party_id).first()
        if row is None:
            raise not_found()
        if "display_name" in request.data:
            name = (request.data.get("display_name") or "").strip()
            if not name:
                raise validation_error([{"field": "display_name", "code": "required", "message": "Enter a name."}])
            row.display_name = name[:255]
        if "email" in request.data:
            row.email = (request.data.get("email") or "")[:254]
        if "phone" in request.data:
            row.phone = (request.data.get("phone") or "")[:64]
        if "status" in request.data:
            status = request.data.get("status")
            if status not in {choice.value for choice in PartyStatus}:
                raise validation_error([{"field": "status", "code": "invalid", "message": "Choose active or inactive."}])
            row.status = status
        row.save()
        return Response(_serialize(row))
