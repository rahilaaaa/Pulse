import hashlib
import secrets
import smtplib
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.identity.models import EmailVerificationToken, User
from apps.identity.serializers import normalize_email
from apps.identity.services import client_ip
from apps.tenants.models import OnboardingState
from common.api.errors import conflict, rate_limited, validation_error
from common.api.exceptions import PulseAPIException

TOKEN_HOURS = 24


def register_user(*, request, email_raw, password, first_name, last_name) -> User:
    details = []
    if not isinstance(email_raw, str) or "@" not in email_raw or not email_raw.strip():
        details.append({"field": "email", "code": "invalid", "message": "Enter a valid email address."})
    if not isinstance(password, str) or password == "":
        details.append({"field": "password", "code": "required", "message": "Enter a password."})
    if not isinstance(first_name, str):
        first_name = ""
    if not isinstance(last_name, str):
        last_name = ""
    if details:
        raise validation_error(details)

    email = normalize_email(email_raw)
    _enforce_throttle(f"register:ip:{client_ip(request)}")
    _record_throttle(f"register:ip:{client_ip(request)}")
    if User.objects.filter(email=email).exists():
        raise conflict("An account with this email address already exists.", [{"field": "email", "code": "unique", "message": "An account with this email address already exists."}])

    user = User(email=email, first_name=first_name.strip(), last_name=last_name.strip())
    try:
        validate_password(password, user)
    except ValidationError as exc:
        messages = [_password_message(message) for message in exc.messages]
        raise validation_error(
            [{"field": "password", "code": "invalid", "message": message} for message in messages],
            message=messages[0],
        ) from exc

    try:
        with transaction.atomic():
            user.set_password(password)
            user.save()
            _issue_token(user)
    except IntegrityError as exc:
        raise conflict("An account with this email address already exists.", [{"field": "email", "code": "unique", "message": "An account with this email address already exists."}]) from exc
    return user


def resend_verification(*, request, user) -> None:
    _enforce_throttle(f"verify:user:{user.id}")
    _record_throttle(f"verify:user:{user.id}")
    if user.email_verified_at is not None:
        return
    _issue_token(user)


def confirm_verification(*, token: str) -> None:
    if not isinstance(token, str) or not token.strip():
        raise _token_error("This verification link is not valid.")
    token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        row = (
            EmailVerificationToken.objects.select_for_update()
            .filter(token_hash=token_hash)
            .select_related("user")
            .first()
        )
        if row is None:
            raise _token_error("This verification link is not valid.")
        if row.used_at is not None:
            if row.user.email_verified_at is not None:
                raise _token_error("This email address is already verified. Sign in.")
            raise _token_error("This link was replaced by a newer verification email. Open the latest message.")
        if row.expires_at <= now:
            raise _token_error("This verification link has expired. Sign in and send a new link.")
        row.used_at = now
        row.save(update_fields=["used_at"])
        user = row.user
        if user.email_verified_at is None:
            user.email_verified_at = now
            user.save(update_fields=["email_verified_at", "updated_at"])
        OnboardingState.objects.filter(owner=user, email_verified_at=None).update(email_verified_at=now)


def _password_message(message: str) -> str:
    text = str(message)
    if "too similar" in text:
        return "This password is too similar to your name or email address. Choose a password that does not include them."
    if "too short" in text or "at least" in text:
        return "Use at least 6 characters."
    if "too common" in text:
        return "This password is too common. Choose a less common password."
    if "entirely numeric" in text:
        return "Do not use a password made only of numbers."
    return text


def _issue_token(user: User) -> None:
    now = timezone.now()
    EmailVerificationToken.objects.filter(user=user, used_at=None).update(used_at=now)
    raw = secrets.token_urlsafe(32)
    EmailVerificationToken.objects.create(
        user=user,
        token_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        expires_at=now + timedelta(hours=TOKEN_HOURS),
    )
    link = f"{settings.FRONTEND_ORIGIN}/verify-email?token={raw}"
    try:
        send_mail(
            subject="Verify your Pulse email",
            message=f"Open this link to verify your email address. It expires in {TOKEN_HOURS} hours.\n\n{link}\n",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except (OSError, smtplib.SMTPException) as exc:
        raise PulseAPIException(
            code="email_delivery_failed",
            message="The verification message could not be delivered to that inbox.",
            status_code=502,
        ) from exc


def email_delivery() -> str:
    return "smtp" if settings.EMAIL_BACKEND.endswith("smtp.EmailBackend") else "console"


def _token_error(message: str):
    return validation_error([{"field": "token", "code": "invalid", "message": message}], message=message)


def _enforce_throttle(key: str) -> None:
    from django.core.cache import cache

    if cache.get(key, 0) >= settings.LOGIN_ATTEMPT_LIMIT:
        raise rate_limited()


def _record_throttle(key: str) -> None:
    from django.core.cache import cache

    window = settings.LOGIN_ATTEMPT_WINDOW_SECONDS
    if cache.add(key, 1, timeout=window):
        return
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=window)
