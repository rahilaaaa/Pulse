
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import PasswordResetToken, User
from apps.accounts.services.password_reset_email import (
    send_password_reset_email,
)


TOKEN_EXPIRY_MINUTES = 60


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def request_password_reset(email: str) -> None:
    normalized_email = email.strip().lower()

    user = User.objects.filter(
        email__iexact=normalized_email,
        is_active=True,
        email_verified_at__isnull=False,
    ).first()

    # The API must return the same response whether the account exists or not.
    if user is None:
        return

    raw_token = secrets.token_urlsafe(32)

    with transaction.atomic():
        PasswordResetToken.objects.filter(
            user=user,
            used_at__isnull=True,
        ).update(used_at=timezone.now())

        PasswordResetToken.objects.create(
            user=user,
            token_hash=hash_token(raw_token),
            expires_at=timezone.now() + timedelta(
                minutes=TOKEN_EXPIRY_MINUTES
            ),
        )

        transaction.on_commit(
            lambda: send_password_reset_email(user, raw_token)
        )


def reset_password(raw_token: str, new_password: str) -> None:
    token_hash = hash_token(raw_token)

    with transaction.atomic():
        reset_token = (
            PasswordResetToken.objects
            .select_for_update()
            .select_related("user")
            .filter(token_hash=token_hash)
            .first()
        )

        if reset_token is None or not reset_token.is_valid:
            raise ValidationError(
                "This password reset link is invalid or expired."
            )

        user = reset_token.user

        validate_password(new_password, user=user)

        user.set_password(new_password)
        user.save(update_fields=["password"])

        reset_token.used_at = timezone.now()
        reset_token.save(update_fields=["used_at"])

        # Invalidate any other outstanding reset tokens.
        PasswordResetToken.objects.filter(
            user=user,
            used_at__isnull=True,
        ).exclude(pk=reset_token.pk).update(
            used_at=timezone.now()
        )
