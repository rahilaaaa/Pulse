
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework.exceptions import ValidationError

from apps.companies.models import Company
from apps.invitations.models import Invitation, InvitationResendAttempt
from apps.memberships.models import CompanyMembership


INVITATION_EXPIRY_DAYS = 7
MAX_INVITATION_RESENDS = 3
RESEND_WINDOW = timedelta(hours=1)


def generate_invitation_token():
    """Generate a cryptographically secure invitation token."""
    return secrets.token_urlsafe(32)


def hash_invitation_token(token):
    """Return the SHA-256 hash of an invitation token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def send_invitation_email(invitation, raw_token):
    """Send an invitation email containing the raw token."""
    invitation_url = (
        f"{settings.FRONTEND_URL}/accept-invitation"
        f"?token={raw_token}"
    )

    send_mail(
        subject=f"Invitation to join {invitation.company.name}",
        message=(
            f"You have been invited to join "
            f"{invitation.company.name}.\n\n"
            f"Accept your invitation here:\n{invitation_url}\n\n"
            f"This invitation expires in {INVITATION_EXPIRY_DAYS} days."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invitation.email],
        fail_silently=False,
    )


@transaction.atomic
def create_invitation(company, email, role, invited_by):
    """
    Create a company invitation.

    Returns:
        tuple: (invitation, raw_token)
    """
    email = email.strip().lower()
    now = timezone.now()

    # Check whether this email already has a company membership.
    existing_membership = CompanyMembership.objects.filter(
        company=company,
        user__email__iexact=email,
    ).first()

    if existing_membership:
        if existing_membership.status == CompanyMembership.Status.ACTIVE:
            raise ValidationError(
                {"email": "This user is already a member of the company."}
            )

        if existing_membership.status == CompanyMembership.Status.SUSPENDED:
            raise ValidationError(
                {"email": "This user's membership is suspended."}
            )

        if existing_membership.status == CompanyMembership.Status.PENDING:
            raise ValidationError(
                {"email": "This user already has a pending membership."}
            )

        if existing_membership.status == CompanyMembership.Status.REMOVED:
            raise ValidationError(
                {"email": "This user's previous membership was removed."}
            )

    # Mark previously expired pending invitations as expired.
    Invitation.objects.filter(
        company=company,
        email=email,
        status=Invitation.Status.PENDING,
        expires_at__lte=now,
    ).update(
        status=Invitation.Status.EXPIRED,
        updated_at=now,
    )

    # Prevent duplicate pending invitations.
    existing_invitation = Invitation.objects.filter(
        company=company,
        email=email,
        status=Invitation.Status.PENDING,
    ).first()

    if existing_invitation:
        raise ValidationError(
            {"email": "A pending invitation already exists for this email."}
        )

    raw_token = generate_invitation_token()

    try:
        invitation = Invitation.objects.create(
            company=company,
            email=email,
            role=role,
            token_hash=hash_invitation_token(raw_token),
            invited_by=invited_by,
            expires_at=now + timedelta(days=INVITATION_EXPIRY_DAYS),
            last_sent_at=now,
        )
    except IntegrityError:
        raise ValidationError(
            {"email": "A pending invitation already exists for this email."}
        )

    return invitation, raw_token


@transaction.atomic
def resend_invitation(invitation_id, company):
    """
    Resend a pending or expired invitation.

    Policy:
    - Maximum 3 resends per rolling hour.
    - Initial invitation does not count as a resend.
    - A new token invalidates the previous token.
    - Expiry is extended by 7 days.
    """

    invitation = (
        Invitation.objects
        .select_for_update()
        .filter(
            id=invitation_id,
            company=company,
        )
        .first()
    )

    if invitation is None:
        raise ValidationError("Invitation not found.")

    if invitation.status not in [
        Invitation.Status.PENDING,
        Invitation.Status.EXPIRED,
    ]:
        raise ValidationError(
            "Only pending or expired invitations can be resent."
        )

    now = timezone.now()

    # Prevent restoring an expired invitation when another
    # pending invitation already exists for the same email.
    another_pending = Invitation.objects.filter(
        company=company,
        email=invitation.email,
        status=Invitation.Status.PENDING,
    ).exclude(
        id=invitation.id,
    ).exists()

    if another_pending:
        raise ValidationError(
            "A newer pending invitation already exists for this email."
        )

    # Prevent sending invitations to existing company members.
    existing_membership = CompanyMembership.objects.filter(
        company=company,
        user__email__iexact=invitation.email,
    ).exists()

    if existing_membership:
        raise ValidationError(
            "A membership already exists for this user. "
            "The invitation cannot be resent."
        )

    # Count resend attempts within the previous hour.
    window_start = now - RESEND_WINDOW

    recent_attempts = InvitationResendAttempt.objects.filter(
        invitation=invitation,
        created_at__gt=window_start,
    ).count()

    if recent_attempts >= MAX_INVITATION_RESENDS:
        raise ValidationError(
            "Maximum of 3 resends per hour reached. Try again later."
        )

    # Generate a new secure token.
    raw_token = generate_invitation_token()

    invitation.token_hash = hash_invitation_token(raw_token)
    invitation.status = Invitation.Status.PENDING
    invitation.expires_at = now + timedelta(days=INVITATION_EXPIRY_DAYS)
    invitation.last_sent_at = now
    invitation.resend_count += 1

    invitation.save(
        update_fields=[
            "token_hash",
            "status",
            "expires_at",
            "last_sent_at",
            "resend_count",
            "updated_at",
        ]
    )

    # Record this resend attempt.
    InvitationResendAttempt.objects.create(
        invitation=invitation,
    )

    # Send email only after the database transaction commits.
    transaction.on_commit(
        lambda: send_invitation_email(invitation, raw_token)
    )

    return invitation


@transaction.atomic
def accept_invitation(raw_token, user):
    """
    Accept an invitation for the authenticated, verified user.

    Returns:
        CompanyMembership
    """
    token_hash = hash_invitation_token(raw_token)

    expired = False
    membership = None

    invitation = (
        Invitation.objects
        .select_for_update()
        .select_related("company")
        .filter(token_hash=token_hash)
        .first()
    )

    if invitation is None:
        raise ValidationError("Invalid invitation token.")

    if invitation.status != Invitation.Status.PENDING:
        raise ValidationError(
            "This invitation is no longer available."
        )

    now = timezone.now()

    if invitation.expires_at <= now:
        invitation.status = Invitation.Status.EXPIRED
        invitation.save(
            update_fields=["status", "updated_at"]
        )
        expired = True

    else:
        # Prevent joining inactive companies.
        if invitation.company.status != Company.Status.ACTIVE:
            raise ValidationError(
                "Cannot accept an invitation because this company is not active."
            )

        # Ensure the invitation belongs to the authenticated user.
        if user.email.strip().lower() != invitation.email.strip().lower():
            raise ValidationError(
                "This invitation belongs to a different email address."
            )

        # Only active, email-verified users can accept invitations.
        if not user.is_active or not user.email_verified_at:
            raise ValidationError(
                "Your account must be active and email verified."
            )

        membership = (
            CompanyMembership.objects
            .select_for_update()
            .filter(
                user=user,
                company=invitation.company,
            )
            .first()
        )

        if membership is None:
            membership = CompanyMembership.objects.create(
                user=user,
                company=invitation.company,
                role=invitation.role,
                status=CompanyMembership.Status.ACTIVE,
                joined_at=now,
            )

        else:
            if membership.status != CompanyMembership.Status.PENDING:
                raise ValidationError(
                    "You already have a membership in this company."
                )

            membership.role = invitation.role
            membership.status = CompanyMembership.Status.ACTIVE
            membership.joined_at = now

            membership.save(
                update_fields=[
                    "role",
                    "status",
                    "joined_at",
                    "updated_at",
                ]
            )

        invitation.status = Invitation.Status.ACCEPTED
        invitation.accepted_at = now

        invitation.save(
            update_fields=[
                "status",
                "accepted_at",
                "updated_at",
            ]
        )

    if expired:
        raise ValidationError("This invitation has expired.")

    return membership
