import uuid

from django.db import models


class LeadStatus(models.TextChoices):
    NEW = "new", "New"
    QUALIFIED = "qualified", "Qualified"
    CONVERTED = "converted", "Converted"
    LOST = "lost", "Lost"


class OpportunityStage(models.TextChoices):
    QUALIFICATION = "qualification", "Qualification"
    PROPOSAL = "proposal", "Proposal"
    NEGOTIATION = "negotiation", "Negotiation"
    WON = "won", "Won"
    LOST = "lost", "Lost"


class Account(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="crm_accounts")
    party = models.ForeignKey("parties.Party", on_delete=models.PROTECT, related_name="crm_accounts")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "crm_accounts"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="crm_accounts_company_id_id_unique"),
        ]


class Contact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="crm_contacts")
    party = models.ForeignKey("parties.Party", on_delete=models.PROTECT, related_name="crm_contacts")
    account = models.ForeignKey(Account, null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts")
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "crm_contacts"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="crm_contacts_company_id_id_unique"),
        ]


class Lead(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="crm_leads")
    party = models.ForeignKey("parties.Party", null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_leads")
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=LeadStatus.choices, default=LeadStatus.NEW)
    email = models.EmailField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "crm_leads"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="crm_leads_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in LeadStatus]),
                name="crm_leads_status_valid",
            ),
        ]


class Opportunity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="crm_opportunities")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="opportunities")
    name = models.CharField(max_length=255)
    stage = models.CharField(max_length=32, choices=OpportunityStage.choices, default=OpportunityStage.QUALIFICATION)
    amount_minor = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "crm_opportunities"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="crm_opportunities_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(stage__in=[choice.value for choice in OpportunityStage]),
                name="crm_opportunities_stage_valid",
            ),
        ]
