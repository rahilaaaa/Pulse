import hashlib

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.authorization.company import assign_default_member_role, bootstrap_company_access
from apps.identity.models import User
from apps.identity.registration import _password_message
from apps.identity.serializers import serialize_current_user
from apps.identity.services import complete_login
from apps.organization.models import Person, PersonStatus
from apps.tenants.models import CompanyMembership, InvitationStatus, MembershipInvitation, MembershipStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_authenticated, permission_denied, validation_error


def load_pending_invitation(token: str | None) -> MembershipInvitation:
    if not isinstance(token, str) or not token.strip():
        raise validation_error(
            [{"field": "token", "code": "required", "message": "This invitation link is not valid."}]
        )
    token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    invitation = MembershipInvitation.objects.select_related("company").filter(token_hash=token_hash).first()
    if invitation is None or invitation.status != InvitationStatus.PENDING or invitation.expires_at < timezone.now():
        raise conflict("This invitation is no longer valid.")
    return invitation


def preview_invitation(token: str | None) -> dict:
    invitation = load_pending_invitation(token)
    return {
        "email": invitation.email,
        "company_display_name": invitation.company.display_name,
        "account_exists": User.objects.filter(email=invitation.email).exists(),
    }


def accept_invitation(*, request, invitation: MembershipInvitation, user: User) -> dict:
    if invitation.email != user.email:
        raise permission_denied("Sign in with the invited email address.")
    if user.email_verified_at is None:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])

    with transaction.atomic():
        invitation = MembershipInvitation.objects.select_for_update().select_related("company").get(pk=invitation.pk)
        if invitation.status != InvitationStatus.PENDING or invitation.expires_at < timezone.now():
            raise conflict("This invitation is no longer valid.")

        bootstrap_company_access(invitation.company, invitation.company.created_by or user)
        membership, _created = CompanyMembership.objects.get_or_create(
            company=invitation.company,
            user=user,
            defaults={"status": MembershipStatus.ACTIVE, "joined_at": timezone.now()},
        )
        membership.status = MembershipStatus.ACTIVE
        membership.joined_at = membership.joined_at or timezone.now()
        if membership.person_id is None:
            person = (
                Person.objects.filter(company=invitation.company, work_email=invitation.email)
                .order_by("created_at")
                .first()
            )
            if person is None:
                person = Person.objects.create(
                    company=invitation.company,
                    first_name=user.first_name,
                    last_name=user.last_name,
                    work_email=user.email,
                    status=PersonStatus.ACTIVE,
                )
            membership.person = person
        membership.save()
        assign_default_member_role(membership, assigned_by=invitation.invited_by)

        now = timezone.now()
        invitation.status = InvitationStatus.ACCEPTED
        invitation.accepted_by = user
        invitation.accepted_at = now
        invitation.save(update_fields=["status", "accepted_by", "accepted_at", "updated_at"])
        AuditLog.objects.create(
            company=invitation.company,
            actor=user,
            action="membership.invitation_accepted",
            object_type="membership_invitation",
            object_id=invitation.id,
            before={"status": InvitationStatus.PENDING, "email": invitation.email},
            after={
                "status": invitation.status,
                "email": invitation.email,
                "membership_id": str(membership.id),
                "accepted_at": invitation.accepted_at.isoformat(),
                "custom_data": dict(invitation.custom_data or {}),
            },
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    return {"company_id": str(invitation.company_id)}


def _person_for_invitation(invitation: MembershipInvitation) -> Person | None:
    return (
        Person.objects.filter(company=invitation.company, work_email=invitation.email)
        .order_by("created_at")
        .first()
    )


def join_with_invitation(*, request, token: str | None, password) -> dict:
    """Join via invitation. Names come from the admin-created Person when present; client names are ignored."""
    invitation = load_pending_invitation(token)
    if not isinstance(password, str) or password == "":
        raise validation_error([{"field": "password", "code": "required", "message": "Enter a password."}])

    person = _person_for_invitation(invitation)
    seed_first = (person.first_name if person else "") or ""
    seed_last = (person.last_name if person else "") or ""

    user = User.objects.filter(email=invitation.email).first()
    if user is None:
        user = User(email=invitation.email, first_name=seed_first, last_name=seed_last)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            messages = [_password_message(message) for message in exc.messages]
            raise validation_error(
                [{"field": "password", "code": "invalid", "message": message} for message in messages],
                message=messages[0],
            ) from exc
        user.set_password(password)
        user.email_verified_at = timezone.now()
        user.save()
    else:
        if not user.is_active or not user.check_password(password):
            raise not_authenticated("The email address or password is incorrect.")
        updates = []
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            updates.append("email_verified_at")
        if seed_first and not user.first_name:
            user.first_name = seed_first
            updates.append("first_name")
        if seed_last and not user.last_name:
            user.last_name = seed_last
            updates.append("last_name")
        if updates:
            updates.append("updated_at")
            user.save(update_fields=updates)

    result = accept_invitation(request=request, invitation=invitation, user=user)
    complete_login(request, user)
    payload = serialize_current_user(user)
    payload["company_id"] = result["company_id"]
    return payload
