import re
import uuid

from django.conf import settings
from django.db import models

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class CompanyStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"
    CLOSED = "closed", "Closed"


class MembershipStatus(models.TextChoices):
    INVITED = "invited", "Invited"
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"
    REMOVED = "removed", "Removed"


class Company(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=63, unique=True)
    legal_name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=CompanyStatus.choices)
    country_code = models.CharField(max_length=2, default="IN")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    custom_data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="companies_created",
        db_column="created_by_user_id",
    )
    suspended_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "companies"
        indexes = [
            models.Index(fields=["status"], name="companies_status_idx"),
            models.Index(fields=["created_at"], name="companies_created_at_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in CompanyStatus]),
                name="companies_status_valid",
            )
        ]

    def __str__(self) -> str:
        return self.display_name


class LegalEntityStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class LegalEntity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="legal_entities")
    name = models.CharField(max_length=180)
    code = models.SlugField(max_length=64)
    status = models.CharField(max_length=32, choices=LegalEntityStatus.choices, default=LegalEntityStatus.DRAFT)
    country_code = models.CharField(max_length=2, default="IN")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="legal_entities_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "legal_entities"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="legal_entities_company_name_unique"),
            models.UniqueConstraint(fields=["company", "code"], name="legal_entities_company_code_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="legal_entities_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in LegalEntityStatus]),
                name="legal_entities_status_valid",
            ),
        ]


class CompanyMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="memberships",
    )
    status = models.CharField(max_length=32, choices=MembershipStatus.choices)
    custom_data = models.JSONField(default=dict, blank=True)
    joined_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_memberships"
        indexes = [
            models.Index(fields=["user"], name="company_memberships_user_idx"),
            models.Index(fields=["company", "status"], name="company_memberships_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="company_memberships_company_id_id_unique"),
            models.UniqueConstraint(fields=["company", "user"], name="company_memberships_company_user_unique"),
            models.UniqueConstraint(
                fields=["company", "person"],
                condition=models.Q(person__isnull=False),
                name="company_memberships_person_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in MembershipStatus]),
                name="company_memberships_status_valid",
            ),
        ]


class CompanyBillingProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="billing_profile")
    billing_name = models.CharField(max_length=255)
    billing_email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True, null=True)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state_code = models.CharField(max_length=8)
    postal_code = models.CharField(max_length=16)
    country_code = models.CharField(max_length=2, default="IN")
    gstin = models.CharField(max_length=15, blank=True, null=True)
    place_of_supply_state_code = models.CharField(max_length=8, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_billing_profiles"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gstin__isnull=True)
                | models.Q(gstin__regex=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"),
                name="billing_gstin_format",
            )
        ]


class OnboardingState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="onboarding_state")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="onboarding_states",
        db_column="owner_user_id",
    )
    email_verified_at = models.DateTimeField(null=True, blank=True)
    company_created_at = models.DateTimeField(null=True, blank=True)
    profile_completed_at = models.DateTimeField(null=True, blank=True)
    billing_profile_completed_at = models.DateTimeField(null=True, blank=True)
    plan_selected_at = models.DateTimeField(null=True, blank=True)
    checkout_started_at = models.DateTimeField(null=True, blank=True)
    subscription_activated_at = models.DateTimeField(null=True, blank=True)
    workspace_entered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "onboarding_states"


class InvitationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    REVOKED = "revoked", "Revoked"
    EXPIRED = "expired", "Expired"


class MembershipInvitation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="invitations")
    person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="membership_invitations",
    )
    email = models.EmailField()
    status = models.CharField(max_length=32, choices=InvitationStatus.choices, default=InvitationStatus.PENDING)
    token_hash = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="invitations_sent",
        db_column="invited_by_user_id",
    )
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="invitations_accepted",
        db_column="accepted_by_user_id",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    custom_data = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "membership_invitations"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "email"],
                condition=models.Q(status="pending"),
                name="membership_invitations_pending_email_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in InvitationStatus]),
                name="membership_invitations_status_valid",
            ),
        ]


class FieldEntity(models.TextChoices):
    PERSON = "person", "Person"
    ORGANIZATION_UNIT = "organization_unit", "Organization Unit"
    TASK = "task", "Task"
    COMPANY = "company", "Company"
    INVITATION = "invitation", "Invitation"
    MEMBERSHIP = "membership", "Membership"


class FieldType(models.TextChoices):
    TEXT = "text", "Text"
    LONG_TEXT = "long_text", "Long text"
    NUMBER = "number", "Number"
    DATE = "date", "Date"
    BOOLEAN = "boolean", "Boolean"
    SELECT = "select", "Select"
    MULTI_SELECT = "multi_select", "Multi-select"
    EMAIL = "email", "Email"
    URL = "url", "URL"
    PHONE = "phone", "Phone"
    REFERENCE = "reference", "Link"


class FieldStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class CustomField(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="custom_fields")
    entity = models.CharField(max_length=32, choices=FieldEntity.choices)
    name = models.CharField(max_length=150)
    key = models.SlugField(max_length=64)
    field_type = models.CharField(max_length=32, choices=FieldType.choices, default=FieldType.TEXT)
    help_text = models.CharField(max_length=255, blank=True, default="")
    required = models.BooleanField(default=False)
    sensitive = models.BooleanField(default=False)
    self_editable = models.BooleanField(default=True)
    filterable = models.BooleanField(default=False)
    options = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    position = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=32, choices=FieldStatus.choices, default=FieldStatus.ACTIVE)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_fields"
        ordering = ["position", "name"]
        constraints = [
            models.UniqueConstraint(fields=["company", "entity", "key"], name="custom_fields_company_entity_key_unique"),
            models.CheckConstraint(
                condition=models.Q(entity__in=[choice.value for choice in FieldEntity]),
                name="custom_fields_entity_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(field_type__in=[choice.value for choice in FieldType]),
                name="custom_fields_type_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in FieldStatus]),
                name="custom_fields_status_valid",
            ),
        ]


class NotificationCategory(models.TextChoices):
    WORK = "work", "Work"
    PEOPLE = "people", "People"
    BILLING = "billing", "Billing"
    SYSTEM = "system", "System"


class Announcement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="announcements")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="announcements",
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    audience = models.CharField(max_length=150, default="Everyone")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "announcements"
        ordering = ["-created_at"]


class CompanyNotification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="notifications")
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="company_notifications",
    )
    category = models.CharField(max_length=32, choices=NotificationCategory.choices, default=NotificationCategory.SYSTEM)
    kind = models.CharField(max_length=32)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    announcement = models.ForeignKey(Announcement, null=True, blank=True, on_delete=models.CASCADE, related_name="deliveries")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "company_notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "recipient", "created_at"], name="company_notices_recipient_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(category__in=[choice.value for choice in NotificationCategory]),
                name="company_notices_category_valid",
            ),
        ]


class NotificationPreference(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="notification_preferences")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences")
    event = models.SlugField(max_length=64)
    in_app = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preferences"
        constraints = [
            models.UniqueConstraint(fields=["company", "user", "event"], name="notification_preferences_event_unique"),
        ]


class CustomEntity(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="custom_entities")
    key = models.SlugField(max_length=64)
    name = models.CharField(max_length=150)
    description = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(max_length=32, choices=FieldStatus.choices, default=FieldStatus.ACTIVE)
    schema_version = models.PositiveIntegerField(default=1)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_entities"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["company", "key"], name="custom_entities_company_key_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="custom_entities_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in FieldStatus]),
                name="custom_entities_status_valid",
            ),
        ]


class CustomEntityField(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="custom_entity_fields")
    entity = models.ForeignKey(CustomEntity, on_delete=models.CASCADE, related_name="fields")
    name = models.CharField(max_length=150)
    key = models.SlugField(max_length=64)
    field_type = models.CharField(max_length=32, choices=FieldType.choices, default=FieldType.TEXT)
    help_text = models.CharField(max_length=255, blank=True, default="")
    required = models.BooleanField(default=False)
    sensitive = models.BooleanField(default=False)
    self_editable = models.BooleanField(default=True)
    filterable = models.BooleanField(default=False)
    is_primary = models.BooleanField(default=False)
    options = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    position = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=32, choices=FieldStatus.choices, default=FieldStatus.ACTIVE)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_entity_fields"
        ordering = ["position", "name"]
        constraints = [
            models.UniqueConstraint(fields=["entity", "key"], name="custom_entity_fields_entity_key_unique"),
            models.CheckConstraint(
                condition=models.Q(field_type__in=[choice.value for choice in FieldType]),
                name="custom_entity_fields_type_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in FieldStatus]),
                name="custom_entity_fields_status_valid",
            ),
        ]


class CustomEntityRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="custom_entity_records")
    entity = models.ForeignKey(CustomEntity, on_delete=models.CASCADE, related_name="records")
    data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="custom_entity_records_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="custom_entity_records_updated",
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_entity_records"
        indexes = [
            models.Index(fields=["company", "entity", "created_at"], name="custom_entity_records_list_idx"),
            models.Index(fields=["company", "entity", "archived_at"], name="custom_entity_records_arch_idx"),
        ]
