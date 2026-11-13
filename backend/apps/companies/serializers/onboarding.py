
from rest_framework import serializers


class CompanyOnboardingSetupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    industry = serializers.CharField(max_length=100)
    business_email = serializers.EmailField()
    phone = serializers.CharField(max_length=30)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
    )
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100)
    postal_code = serializers.CharField(max_length=20)
    country = serializers.CharField(max_length=100)
    website = serializers.URLField(
        max_length=255,
        required=False,
        allow_blank=True,
    )

    def validate(self, attrs):
        # Normalize text fields before saving.
        for field in [
            "name",
            "industry",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "state",
            "postal_code",
            "country",
            "website",
        ]:
            if field in attrs:
                attrs[field] = attrs[field].strip()

        attrs["business_email"] = attrs["business_email"].strip().lower()

        required_fields = [
            "name",
            "industry",
            "phone",
            "address_line_1",
            "city",
            "state",
            "postal_code",
            "country",
        ]

        errors = {
            field: "This field cannot be empty."
            for field in required_fields
            if not attrs.get(field)
        }

        if errors:
            raise serializers.ValidationError(errors)

        return attrs
