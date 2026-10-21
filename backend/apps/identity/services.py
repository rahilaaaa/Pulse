from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.conf import settings

from common.api.errors import rate_limited

DUMMY_PASSWORD_HASH = make_password("pulse-timing-equalizer")
SIGN_IN_FAILED = "The email address or password is incorrect."


def client_ip(request) -> str:
    return request.META.get("REMOTE_ADDR", "") or "unknown"


def enforce_login_throttle(*, ip: str, email: str) -> None:
    limit = settings.LOGIN_ATTEMPT_LIMIT
    window = settings.LOGIN_ATTEMPT_WINDOW_SECONDS
    for key in (f"login:ip:{ip}", f"login:email:{email or 'blank'}"):
        attempts = cache.get(key, 0)
        if attempts >= limit:
            raise rate_limited()


def record_login_attempt(*, ip: str, email: str) -> None:
    window = settings.LOGIN_ATTEMPT_WINDOW_SECONDS
    for key in (f"login:ip:{ip}", f"login:email:{email or 'blank'}"):
        if cache.add(key, 1, timeout=window):
            continue
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=window)


def clear_login_throttle(*, ip: str, email: str) -> None:
    cache.delete_many([f"login:ip:{ip}", f"login:email:{email or 'blank'}"])


def authenticate_credentials(*, email: str, password: str):
    User = get_user_model()
    user = User.objects.filter(email=email).first()
    if user is None:
        check_password(password, DUMMY_PASSWORD_HASH)
        return None
    password_matches = user.check_password(password)
    if not password_matches or not user.is_active:
        return None
    return user
