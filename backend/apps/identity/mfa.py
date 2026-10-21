import base64
import hashlib
import io

import pyotp
import segno
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.core.cache import cache
from django.utils import timezone

from common.api.errors import not_authenticated, rate_limited, validation_error

MFA_USER_ID = "mfa_user_id"
MFA_STEP = "mfa_step"
MFA_PENDING_SECRET = "mfa_pending_secret"
MFA_WINDOW_SECONDS = 300
MFA_ATTEMPT_LIMIT = 5
MFA_CODE_INVALID = "That authentication code is incorrect."
SIGN_IN_AGAIN = "Sign in again to continue."


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_secret(stored: str) -> str | None:
    if not stored:
        return None
    try:
        return _fernet().decrypt(stored.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def user_requires_mfa(user) -> bool:
    return user.platform_grants.exists()


def begin_mfa(request, user) -> dict:
    request.session.flush()
    request.session[MFA_USER_ID] = str(user.id)
    request.session.set_expiry(MFA_WINDOW_SECONDS)
    secret = decrypt_secret(user.mfa_secret)
    if user.mfa_enabled_at and secret:
        request.session[MFA_STEP] = "verify"
        request.session.pop(MFA_PENDING_SECRET, None)
        return {"mfa_required": True, "step": "verify"}

    pending = pyotp.random_base32()
    request.session[MFA_STEP] = "enroll"
    request.session[MFA_PENDING_SECRET] = pending
    return {"mfa_required": True, "step": "enroll", **provisioning(user.email, pending)}


def provisioning(email: str, secret: str) -> dict:
    uri = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Pulse")
    buffer = io.BytesIO()
    segno.make(uri, error="m").save(buffer, kind="svg", xmldecl=False, svgns=True, scale=4)
    svg = buffer.getvalue().decode("utf-8")
    if not svg.lstrip().startswith("<svg") or "<script" in svg.lower():
        svg = ""
    return {"secret": secret, "otpauth_uri": uri, "qr_svg": svg}


def complete_login(request, user):
    request.session.pop(MFA_USER_ID, None)
    request.session.pop(MFA_STEP, None)
    request.session.pop(MFA_PENDING_SECRET, None)
    request.session.set_expiry(None)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session.cycle_key()
    clear_mfa_throttle(str(user.id))


def verify_mfa(request, code: str):
    if not isinstance(code, str) or not code.strip().isdigit() or len(code.strip()) != 6:
        raise validation_error(
            [{"field": "code", "code": "invalid", "message": "Enter the 6-digit code from your authenticator app."}]
        )
    user_id = request.session.get(MFA_USER_ID)
    step = request.session.get(MFA_STEP)
    if not user_id or step not in {"enroll", "verify"}:
        raise not_authenticated(SIGN_IN_AGAIN)

    enforce_mfa_throttle(user_id)
    User = get_user_model()
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None or not user_requires_mfa(user):
        request.session.flush()
        raise not_authenticated(SIGN_IN_AGAIN)

    if step == "enroll":
        secret = request.session.get(MFA_PENDING_SECRET)
    else:
        secret = decrypt_secret(user.mfa_secret)
    if not secret or not pyotp.TOTP(secret).verify(code.strip(), valid_window=1):
        record_mfa_failure(user_id)
        raise not_authenticated(MFA_CODE_INVALID)

    if step == "enroll":
        user.mfa_secret = encrypt_secret(secret)
        user.mfa_enabled_at = timezone.now()
        user.save(update_fields=["mfa_secret", "mfa_enabled_at", "updated_at"])
    complete_login(request, user)
    return user


def enforce_mfa_throttle(user_id: str) -> None:
    if cache.get(_mfa_key(user_id), 0) >= MFA_ATTEMPT_LIMIT:
        raise rate_limited()


def record_mfa_failure(user_id: str) -> None:
    key = _mfa_key(user_id)
    if cache.add(key, 1, timeout=MFA_WINDOW_SECONDS):
        return
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=MFA_WINDOW_SECONDS)


def clear_mfa_throttle(user_id: str) -> None:
    cache.delete(_mfa_key(user_id))


def _mfa_key(user_id: str) -> str:
    return f"mfa:user:{user_id}"
