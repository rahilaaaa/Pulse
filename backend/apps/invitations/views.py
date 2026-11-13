
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.exceptions import (
    ValidationError,
    NotFound,
    PermissionDenied,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.invitations.models import Invitation
from apps.invitations.serializers import (
    CreateInvitationSerializer,
    InvitationSerializer,
    AcceptInvitationSerializer,
)
from apps.invitations.services import (
    create_invitation,
    accept_invitation,
    resend_invitation,
    send_invitation_email,
)

from apps.memberships.models import CompanyMembership
from apps.memberships.permissions.company_access import HasActiveCompany
from apps.memberships.permissions.company_management import CanManageMemberships


class CompanyInvitationListCreateView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
        CanManageMemberships,
    ]

    def get(self, request):
        """List invitations belonging to the active company."""

        invitations = (
            request.company.invitations
            .select_related("invited_by")
            .order_by("-created_at")
        )

        serializer = InvitationSerializer(
            invitations,
            many=True,
        )

        return Response(serializer.data)

    def post(self, request):
        """Create a new company invitation."""

        serializer = CreateInvitationSerializer(
            data=request.data,
            context={"request": request},
        )

        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]

        # Only Owners can invite administrators.
        if (
            role == Invitation.Role.ADMIN
            and request.company_membership.role
            != CompanyMembership.Role.OWNER
        ):
            raise PermissionDenied(
                "Only company owners can invite administrators."
            )

        try:
            invitation, raw_token = create_invitation(
                company=request.company,
                email=email,
                role=role,
                invited_by=request.user,
            )

        except IntegrityError:
            raise ValidationError({
                "email": (
                    "A pending invitation already exists "
                    "for this email."
                )
            })

        # Send email only after the database transaction commits.
        transaction.on_commit(
            lambda: send_invitation_email(
                invitation,
                raw_token,
            )
        )

        return Response(
            {
                "message": "Invitation created successfully.",
                "invitation": InvitationSerializer(
                    invitation
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ResendInvitationView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
        CanManageMemberships,
    ]

    def post(self, request, invitation_id):
        """Resend an existing pending or expired invitation."""

        invitation = Invitation.objects.filter(
            id=invitation_id,
            company=request.company,
        ).first()

        if invitation is None:
            raise NotFound("Invitation not found.")

        # Admins can resend member invitations only.
        # Only Owners can resend administrator invitations.
        if (
            invitation.role == Invitation.Role.ADMIN
            and request.company_membership.role
            != CompanyMembership.Role.OWNER
        ):
            raise PermissionDenied(
                "Only company owners can resend administrator invitations."
            )

        updated_invitation = resend_invitation(
            invitation_id=invitation_id,
            company=request.company,
        )

        return Response(
            {
                "message": "Invitation resent successfully.",
                "invitation": InvitationSerializer(
                    updated_invitation
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class AcceptInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Accept an invitation using its secure token."""

        serializer = AcceptInvitationSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        membership = accept_invitation(
            raw_token=serializer.validated_data["token"],
            user=request.user,
        )

        return Response(
            {
                "message": "Invitation accepted successfully.",
                "company": {
                    "id": membership.company_id,
                    "name": membership.company.name,
                },
                "membership": {
                    "id": membership.id,
                    "role": membership.role,
                    "status": membership.status,
                    "joined_at": membership.joined_at,
                },
            },
            status=status.HTTP_200_OK,
        )


class RevokeInvitationView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
        CanManageMemberships,
    ]

    def patch(self, request, invitation_id):
        """Revoke a pending invitation."""

        now = timezone.now()
        expired = False

        with transaction.atomic():
            invitation = (
                Invitation.objects
                .select_for_update()
                .filter(
                    id=invitation_id,
                    company=request.company,
                )
                .first()
            )

            if invitation is None:
                raise NotFound("Invitation not found.")

            if invitation.status != Invitation.Status.PENDING:
                raise ValidationError(
                    "Only pending invitations can be revoked."
                )

            if invitation.expires_at <= now:
                invitation.status = Invitation.Status.EXPIRED

                invitation.save(
                    update_fields=[
                        "status",
                        "updated_at",
                    ]
                )

                expired = True

            else:
                invitation.status = Invitation.Status.REVOKED
                invitation.revoked_at = now

                invitation.save(
                    update_fields=[
                        "status",
                        "revoked_at",
                        "updated_at",
                    ]
                )

        if expired:
            return Response(
                {
                    "detail": "This invitation has expired."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "message": "Invitation revoked successfully.",
                "invitation": InvitationSerializer(
                    invitation
                ).data,
            },
            status=status.HTTP_200_OK,
        )
