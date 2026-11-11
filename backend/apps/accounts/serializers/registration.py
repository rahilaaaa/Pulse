
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.companies.models import Company

User = get_user_model()


class CompanyRegistrationSerializer(serializers.Serializer):
    # Company details
    company_name = serializers.CharField(max_length=255)
    industry = serializers.CharField(max_length=100)
    business_email = serializers.EmailField()
    phone = serializers.CharField(max_length=30)
    country = serializers.CharField(max_length=100)
    website = serializers.URLField(
        max_length=255,
        required=False,
        allow_blank=True,
    )

    # Administrator details
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        min_length=12,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_email(self, value):
        email = User.objects.normalize_email(value).strip().lower()

        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return email

    def validate_company_name(self, value):
        return value.strip()

    def validate_business_email(self, value):
        return value.strip().lower()

    def validate_first_name(self, value):
        return value.strip()

    def validate_last_name(self, value):
        return value.strip()

    def validate_industry(self, value):
        return value.strip()

    def validate_phone(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Phone number is required."
            )

        return value

    def validate_country(self, value):
        return value.strip()

    def validate(self, attrs):
        if not attrs["company_name"]:
            raise serializers.ValidationError({
                "company_name": "Company name is required."
            })

        return attrs
