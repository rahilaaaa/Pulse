from django.core.exceptions import ValidationError
from django.db import connection
from django.test import TestCase

from apps.authorization.models import Permission, PermissionScope, PlatformPermissionGrant
from apps.identity.models import User


class PlatformGrantTests(TestCase):
    def test_company_scope_permission_cannot_be_granted(self):
        user = User.objects.create_user(email="owner@example.com", password="a-long-passphrase")
        permission = Permission.objects.get(code="company.view")
        self.assertEqual(permission.scope, PermissionScope.COMPANY)
        with self.assertRaises(ValidationError):
            PlatformPermissionGrant.objects.create(user=user, permission=permission)

    def test_platform_permission_is_not_a_column_on_the_user(self):
        field_names = {field.name for field in User._meta.fields}
        self.assertNotIn("is_superuser", field_names)
        self.assertNotIn("is_staff", field_names)
        with connection.cursor() as cursor:
            columns = {column.name for column in connection.introspection.get_table_description(cursor, "users")}
        self.assertIn("password_hash", columns)
        self.assertNotIn("is_superuser", columns)
