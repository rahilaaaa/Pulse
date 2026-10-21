import re

from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from apps.identity.models import PasswordResetToken, User

PASSWORD = "a-long-passphrase"
NEW_PASSWORD = "another-long-passphrase"


class PasswordResetTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(email="founder@example.com", password=PASSWORD, first_name="Asha", last_name="Menon")

    def _request(self, email="founder@example.com"):
        return self.client.post("/api/v1/auth/password-resets/", {"email": email}, format="json")

    def _token(self):
        match = re.search(r"token=(\S+)", mail.outbox[-1].body)
        self.assertIsNotNone(match)
        return match.group(1)

    def test_unknown_email_does_not_send_or_reveal_the_account(self):
        response = self._request("missing@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "accepted"})
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(PasswordResetToken.objects.count(), 0)

    def test_reset_replaces_the_password_once(self):
        response = self._request()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn(PASSWORD, mail.outbox[0].body)
        token = self._token()
        self.assertFalse(PasswordResetToken.objects.filter(token_hash=token).exists())

        weak = self.client.post("/api/v1/auth/password-resets/confirm/", {"token": token, "password": "short"}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

        confirmed = self.client.post(
            "/api/v1/auth/password-resets/confirm/",
            {"token": token, "password": NEW_PASSWORD},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertIsNotNone(PasswordResetToken.objects.get(user=self.user).used_at)

        again = self.client.post(
            "/api/v1/auth/password-resets/confirm/",
            {"token": token, "password": "yet-another-passphrase"},
            format="json",
        )
        self.assertEqual(again.status_code, 400)
        login = self.client.post("/api/v1/auth/login/", {"email": self.user.email, "password": NEW_PASSWORD}, format="json")
        self.assertEqual(login.status_code, 200)

    def test_expired_link_is_rejected(self):
        self._request()
        PasswordResetToken.objects.filter(user=self.user).update(expires_at=timezone.now() - timedelta(minutes=1))
        response = self.client.post(
            "/api/v1/auth/password-resets/confirm/",
            {"token": self._token(), "password": NEW_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))
