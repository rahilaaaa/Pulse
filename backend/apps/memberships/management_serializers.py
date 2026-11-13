
from rest_framework import serializers

from apps.memberships.models import CompanyMembership


class CompanyMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(
        source="user.id",
        read_only=True,
    )
    email = serializers.EmailField(
        source="user.email",
        read_only=True,
    )
    first_name = serializers.CharField(
        source="user.first_name",
        read_only=True,
    )
    last_name = serializers.CharField(
        source="user.last_name",
        read_only=True,
    )

    class Meta:
        model = CompanyMembership
        fields = [
            "id",
            "user_id",
            "email",
            "first_name",
            "last_name",
            "role",
            "status",
            "joined_at",
            "created_at",
        ]
        read_only_fields = fields


class UpdateCompanyMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyMembership
        fields = ["role", "status"]
