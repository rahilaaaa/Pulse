from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import require_permission
from apps.crm.models import Account, Contact, Lead, LeadStatus, Opportunity
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.parties.models import Party, PartyKind
from common.api.errors import conflict, not_found, validation_error


def _installed(company):
    if not CompanyModuleInstallation.objects.filter(company=company, module_id="crm", status=InstallationStatus.INSTALLED).exists():
        raise not_found("CRM is not installed.")


class LeadListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "crm.view")
        _installed(membership.company)
        rows = Lead.objects.filter(company=membership.company).order_by("-created_at")
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "title": row.title,
                        "status": row.status,
                        "email": row.email,
                        "party_id": str(row.party_id) if row.party_id else None,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "crm.manage")
        _installed(membership.company)
        title = (request.data.get("title") or "").strip()
        if not title:
            raise validation_error([{"field": "title", "code": "required", "message": "Enter a lead title."}])
        row = Lead.objects.create(
            company=membership.company,
            title=title[:255],
            email=(request.data.get("email") or "")[:254],
        )
        return Response({"id": str(row.id), "title": row.title, "status": row.status}, status=201)


class LeadConvertView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, lead_id):
        membership = require_permission(request.user, company_id, "crm.manage")
        _installed(membership.company)
        lead = Lead.objects.filter(company=membership.company, pk=lead_id).first()
        if lead is None:
            raise not_found()
        if lead.status == LeadStatus.CONVERTED:
            raise conflict("This lead is already converted.")
        with transaction.atomic():
            party = lead.party
            if party is None:
                party = Party.objects.create(
                    company=membership.company,
                    kind=PartyKind.ORGANIZATION,
                    display_name=lead.title,
                    email=lead.email,
                )
            account = Account.objects.create(company=membership.company, party=party, name=lead.title)
            Contact.objects.create(
                company=membership.company,
                party=party,
                account=account,
                email=lead.email,
            )
            opportunity = Opportunity.objects.create(
                company=membership.company,
                account=account,
                name=f"{lead.title} opportunity",
            )
            lead.party = party
            lead.status = LeadStatus.CONVERTED
            lead.save(update_fields=["party", "status", "updated_at"])
        return Response(
            {
                "lead_id": str(lead.id),
                "party_id": str(party.id),
                "account_id": str(account.id),
                "opportunity_id": str(opportunity.id),
            }
        )


class AccountListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "crm.view")
        _installed(membership.company)
        rows = Account.objects.filter(company=membership.company).select_related("party").order_by("name")
        return Response(
            {
                "results": [
                    {"id": str(row.id), "name": row.name, "party_id": str(row.party_id), "party": row.party.display_name}
                    for row in rows
                ]
            }
        )
