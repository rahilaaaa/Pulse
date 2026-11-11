
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import EmailVerification
from apps.companies.models import Company
from apps.memberships.models import CompanyMembership
from django.db import transaction
from apps.accounts.services.email_sender import send_verification_email


@transaction.atomic
def register_company(validated_data):
    # Generate a secure, random verification token.
    raw_token = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    # Create the administrator account.
    user = settings.AUTH_USER_MODEL

    from django.contrib.auth import get_user_model
    User = get_user_model()

    user = User.objects.create_user(
        email=validated_data["email"],
        password=validated_data["password"],
        first_name=validated_data["first_name"],
        last_name=validated_data["last_name"],
        is_active=False,
    )

    # Create the company.
    company = Company.objects.create(
        name=validated_data["company_name"],
        industry=validated_data["industry"],
        business_email=validated_data["business_email"],
        phone=validated_data["phone"],
        country=validated_data["country"],
        website=validated_data.get("website", ""),
        status=Company.Status.PENDING,
    )

    # Create the initial owner membership.
    membership = CompanyMembership.objects.create(
        user=user,
        company=company,
        role=CompanyMembership.Role.OWNER,
        status=CompanyMembership.Status.PENDING,
    )

    # Create the email verification record.
    verification = EmailVerification.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=timezone.now() + timedelta(hours=24),
    )

    transaction.on_commit(
    lambda: send_verification_email(user, raw_token))
    
    return {
        "user": user,
        "company": company,
        "membership": membership,
        "verification": verification,
        "raw_token": raw_token,
    }
