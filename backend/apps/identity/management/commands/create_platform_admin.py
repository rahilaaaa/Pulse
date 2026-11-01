from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.authorization.services import grant_all_platform_permissions
from apps.identity.models import User


class Command(BaseCommand):
    help = (
        "Create or update the initial platform operator (bootstrap only). "
        "After the first admin exists, prefer the platform console Invite operator flow."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", default="")
        parser.add_argument("--first-name", default="")
        parser.add_argument("--last-name", default="")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        password = options["password"]
        if not password:
            password = self._prompt_password()
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        with transaction.atomic():
            user = User.objects.filter(email=email).first()
            if user is None:
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    first_name=options["first_name"],
                    last_name=options["last_name"],
                    email_verified_at=timezone.now(),
                )
                created = True
            else:
                if not user.is_active:
                    raise CommandError("That account is deactivated. Reactivate it before granting platform access.")
                user.set_password(password)
                user.email_verified_at = user.email_verified_at or timezone.now()
                user.first_name = options["first_name"] or user.first_name
                user.last_name = options["last_name"] or user.last_name
                user.save()
                created = False
            granted = grant_all_platform_permissions(user)
        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} platform administrator {user.email}. Grants added: {granted}."))

    def _prompt_password(self) -> str:
        import getpass

        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Password (again): ")
        if password != confirm:
            raise CommandError("Passwords did not match.")
        return password
