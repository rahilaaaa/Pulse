
from rest_framework import serializers

from apps.companies.models import Company


class CompanyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "industry",
            "business_email",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state",
            "postal_code",
            "country",
            "website",
            "status",
            "onboarding_completed",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "status",
            "onboarding_completed",
            "created_at",
            "updated_at",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Company name cannot be empty."
            )
        return value

    def validate_industry(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Industry cannot be empty."
            )
        return value

    def validate_business_email(self, value):
        value = value.strip().lower()
        if not value:
            raise serializers.ValidationError(
                "Business email cannot be empty."
            )
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Phone number cannot be empty."
            )
        return value

    def validate_address_line_1(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Address line 1 cannot be empty."
            )
        return value

    def validate_city(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("City cannot be empty.")
        return value

    def validate_state(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("State cannot be empty.")
        return value

    def validate_postal_code(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Postal code cannot be empty."
            )
        return value

    def validate_country(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Country cannot be empty.")
        return value
