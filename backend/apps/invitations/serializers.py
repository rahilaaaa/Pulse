
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.invitations.models import Invitation

User = get_user_model()


class CreateInvitationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=[
            Invitation.Role.ADMIN,
            Invitation.Role.MEMBER,
        ],
        default=Invitation.Role.MEMBER,
    )

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        request = self.context["request"]
        email = attrs["email"]

        # Prevent inviting the current user.
        if email == request.user.email.lower():
            raise serializers.ValidationError({
                "email": "You cannot invite yourself."
            })

        return attrs


class InvitationSerializer(serializers.ModelSerializer):
    invited_by_email = serializers.EmailField(
        source="invited_by.email",
        read_only=True,
    )

    class Meta:
        model = Invitation
        fields = [
            "id",
            "email",
            "role",
            "status",
            "invited_by_email",
            "expires_at",
            "accepted_at",
            "created_at",
        ]
        read_only_fields = fields


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField(
        write_only=True,
        trim_whitespace=True,
    )

    def validate_token(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                "Invitation token is required."
            )

        return value.strip()
