
from rest_framework import serializers


class CompanySelectionSerializer(serializers.Serializer):
    company_id = serializers.IntegerField(min_value=1)
