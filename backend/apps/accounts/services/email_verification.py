
import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import EmailVerification


def create_verification_token(user):
    """
    Create a secure verification token.

    Only the SHA-256 hash is stored in the database.
    The raw token is returned for use in the verification email.
    """

    raw_token = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    with transaction.atomic():
        # Invalidate previous unused verification tokens.
        EmailVerification.objects.filter(
            user=user,
            used_at__isnull=True,
        ).update(used_at=timezone.now())

        verification = EmailVerification.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=24),
        )

    return raw_token, verification


from django.utils import timezone

from apps.accounts.models import EmailVerification
from apps.companies.models import Company
from apps.memberships.models import CompanyMembership


def verify_email_token(raw_token):
    """
    Verify an email token and activate the associated registration.
    """

    if not raw_token:
        return False

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    with transaction.atomic():
        try:
            verification = (
                EmailVerification.objects
                .select_for_update()
                .select_related("user")
                .get(token_hash=token_hash)
            )
        except EmailVerification.DoesNotExist:
            return False

        now = timezone.now()

        if not verification.is_valid:
            return False

        user = verification.user

        # Activate the account and verify the email.
        user.is_active = True
        user.email_verified_at = now
        user.save(
            update_fields=["is_active", "email_verified_at"]
        )

        # Activate the company associated with the owner's membership.
        owner_memberships = (
            CompanyMembership.objects
            .select_for_update()
            .filter(
                user=user,
                role=CompanyMembership.Role.OWNER,
                status=CompanyMembership.Status.PENDING,
                company__status=Company.Status.PENDING,
            )
        )

        for membership in owner_memberships:
            membership.status = CompanyMembership.Status.ACTIVE
            membership.save(update_fields=["status"])

            Company.objects.filter(
                pk=membership.company_id,
                status=Company.Status.PENDING,
            ).update(status=Company.Status.ACTIVE)

        # Mark the verification token as consumed.
        verification.used_at = now
        verification.save(update_fields=["used_at"])

    return True

