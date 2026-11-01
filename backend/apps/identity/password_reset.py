import hashlib
import secrets
import smtplib
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.identity.models import PasswordResetToken, User
from apps.identity.registration import _password_message
from apps.identity.serializers import normalize_email
from apps.identity.services import client_ip
from common.api.errors import validation_error
from common.api.exceptions import PulseAPIException

RESET_HOURS = 1


def request_password_reset(*, request, email_raw) -> None:
    from apps.identity.registration import _enforce_throttle, _record_throttle

    if not isinstance(email_raw, str) or "@" not in email_raw or not email_raw.strip():
        raise validation_error([{"field": "email", "code": "invalid", "message": "Enter a valid email address."}])
    email = normalize_email(email_raw)
    _enforce_throttle(f"reset:ip:{client_ip(request)}")
    _record_throttle(f"reset:ip:{client_ip(request)}")
    user = User.objects.filter(email=email, is_active=True).first()
    if user is None:
        return
    _issue_reset(user)


def confirm_password_reset(*, token: str, password: str) -> None:
    if not isinstance(token, str) or not token.strip():
        raise _token_error("This reset link is not valid.")
    if not isinstance(password, str) or password == "":
        raise validation_error([{"field": "password", "code": "required", "message": "Enter a password."}])
    token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        row = (
            PasswordResetToken.objects.select_for_update()
            .filter(token_hash=token_hash)
            .select_related("user")
            .first()
        )
        if row is None or row.used_at is not None:
            raise _token_error("This reset link is not valid. Request a new one.")
        if row.expires_at <= now:
            raise _token_error("This reset link has expired. Request a new one.")
        user = row.user
        if not user.is_active:
            raise _token_error("This reset link is not valid. Request a new one.")
        try:
            validate_password(password, user)
        except ValidationError as exc:
            messages = [_password_message(message) for message in exc.messages]
            raise validation_error(
                [{"field": "password", "code": "invalid", "message": message} for message in messages],
                message=messages[0],
            ) from exc
        user.set_password(password)
        fields = ["password", "updated_at"]
        if user.email_verified_at is None:
            user.email_verified_at = now
            fields.append("email_verified_at")
        user.save(update_fields=fields)
        row.used_at = now
        row.save(update_fields=["used_at"])
        PasswordResetToken.objects.filter(user=user, used_at=None).update(used_at=now)


def _issue_reset(
    user: User,
    *,
    subject: str | None = None,
    message: str | None = None,
) -> None:
    now = timezone.now()
    PasswordResetToken.objects.filter(user=user, used_at=None).update(used_at=now)
    raw = secrets.token_urlsafe(32)
    PasswordResetToken.objects.create(
        user=user,
        token_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        expires_at=now + timedelta(hours=RESET_HOURS),
    )
    link = f"{settings.FRONTEND_ORIGIN}/reset-password?token={raw}"
    subject = subject or "Reset your Pulse password"
    message = message or (
        "Use this link to choose a new Pulse password. "
        f"It expires in {RESET_HOURS} hour and can be used once.\n\n{link}\n\n"
        "If you did not ask for this, you can ignore the message. Your password will stay the same."
    )
    if "{link}" in message:
        message = message.format(link=link, hours=RESET_HOURS)
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except (OSError, smtplib.SMTPException) as exc:
        raise PulseAPIException(
            code="email_delivery_failed",
            message="The reset message could not be delivered to that inbox.",
            status_code=502,
        ) from exc


def _token_error(message: str):
    return validation_error([{"field": "token", "code": "invalid", "message": message}], message=message)
