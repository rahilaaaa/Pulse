
from rest_framework import serializers

from apps.memberships.models import CompanyMembership


class CompanyMembershipSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(
        source="company.name",
        read_only=True,
    )
    company_industry = serializers.CharField(
        source="company.industry",
        read_only=True,
    )

    class Meta:
        model = CompanyMembership
        fields = [
            "id",
            "company",
            "company_name",
            "company_industry",
            "role",
            "status",
            "joined_at",
        ]
