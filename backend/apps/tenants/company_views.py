import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import (
    assert_owner_remains,
    authorize_owner_role_change,
    bootstrap_company_access,
    effective_permission_codes,
    require_membership,
    require_permission,
)
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.billing.services import subscription_summary
from apps.dashboards.services import dashboard_for_membership, navigation_for
from apps.identity.serializers import normalize_email
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.modules_registry.services import catalog_for_company
from apps.organization.models import Department, Person, PersonStatus, UnitStatus
from apps.tenants.models import CompanyMembership, InvitationStatus, MembershipInvitation, MembershipStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, permission_denied, validation_error


def _role_ids(raw) -> list[uuid.UUID]:
    if not isinstance(raw, list):
        raise validation_error([{"field": "role_ids", "code": "invalid", "message": "Send a list of roles."}])
    parsed: list[uuid.UUID] = []
    for item in raw:
        if not isinstance(item, str):
            raise validation_error([{"field": "role_ids", "code": "invalid", "message": "Send each role id as text."}])
        try:
            parsed.append(uuid.UUID(item))
        except ValueError:
            raise validation_error([{"field": "role_ids", "code": "invalid", "message": "One of those roles was not found."}]) from None
    if len(parsed) != len(set(parsed)):
        raise validation_error([{"field": "role_ids", "code": "invalid", "message": "Send each role once."}])
    return parsed


def _company_for(user):
    membership = (
        CompanyMembership.objects.select_related("company")
        .filter(user=user, status=MembershipStatus.ACTIVE)
        .order_by("created_at")
        .first()
    )
    if membership is None:
        raise not_found("Create a company before opening the dashboard.")
    bootstrap_company_access(membership.company, membership.company.created_by or user)
    return membership


class WorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        membership = require_permission(request.user, _company_for(request.user).company_id, "company.view")
        return Response(
            {
                "company": {
                    "id": str(membership.company_id),
                    "legal_name": membership.company.legal_name,
                    "display_name": membership.company.display_name,
                    "slug": membership.company.slug,
                    "status": membership.company.status,
                    "timezone": membership.company.timezone,
                },
                "permissions": sorted(effective_permission_codes(membership)),
                "navigation": navigation_for(membership),
                "subscription": subscription_summary(membership.company),
                "dashboard": dashboard_for_membership(membership),
            }
        )


class WorkspaceEnterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        membership = _company_for(request.user)
        state = getattr(membership.company, "onboarding_state", None)
        if state and state.workspace_entered_at is None and state.subscription_activated_at:
            state.workspace_entered_at = timezone.now()
            state.save(update_fields=["workspace_entered_at", "updated_at"])
        return Response({"entered": True})


class OverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        membership = require_permission(request.user, _company_for(request.user).company_id, "company.view")
        company = membership.company
        memberships = CompanyMembership.objects.filter(company=company)
        invitations = MembershipInvitation.objects.filter(company=company, status=InvitationStatus.PENDING)
        installations = CompanyModuleInstallation.objects.filter(company=company)
        installed = installations.filter(status=InstallationStatus.INSTALLED).count()
        available = ModuleDefinition.objects.filter(is_public=True).count()
        issues = [
            {"slug": row.module_id, "error": row.last_error}
            for row in installations.filter(status=InstallationStatus.FAILED)
        ]
        activity = []
        for row in AuditLog.objects.filter(company=company).select_related("actor").order_by("-created_at")[:8]:
            actor_name = None
            if row.actor_id:
                actor_name = f"{row.actor.first_name} {row.actor.last_name}".strip() or row.actor.email
            activity.append(
                {
                    "action": row.action,
                    "object_type": row.object_type,
                    "created_at": row.created_at.isoformat(),
                    "actor_email": row.actor.email if row.actor_id else None,
                    "actor_name": actor_name,
                }
            )
        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        try:
            billing = company.billing_profile
        except ObjectDoesNotExist:
            billing = None
        installed_rows = installations.filter(status=InstallationStatus.INSTALLED).select_related("module").order_by("module__display_name")
        return Response(
            {
                "company": {
                    "display_name": company.display_name,
                    "legal_name": company.legal_name,
                    "status": company.status,
                    "slug": company.slug,
                    "timezone": company.timezone,
                    "country_code": company.country_code,
                    "created_at": company.created_at.isoformat(),
                },
                "billing": None
                if billing is None
                else {
                    "billing_name": billing.billing_name,
                    "billing_email": billing.billing_email,
                    "gstin": billing.gstin or "",
                    "country_code": billing.country_code,
                },
                "subscription": subscription_summary(company),
                "users": {
                    "total": memberships.exclude(status=MembershipStatus.REMOVED).count(),
                    "active": memberships.filter(status=MembershipStatus.ACTIVE).count(),
                    "invited": memberships.filter(status=MembershipStatus.INVITED).count(),
                    "suspended": memberships.filter(status=MembershipStatus.SUSPENDED).count(),
                    "no_login": memberships.filter(status=MembershipStatus.ACTIVE, user__last_login__isnull=True).count(),
                    "joined_this_month": memberships.filter(created_at__gte=month_start).exclude(status=MembershipStatus.REMOVED).count(),
                },
                "modules": [
                    {"slug": row.module_id, "name": row.module.display_name, "description": row.module.description}
                    for row in installed_rows
                ],
                "people": Person.objects.filter(company=company).exclude(status=PersonStatus.INACTIVE).count(),
                "units": Department.objects.filter(company=company).exclude(status=UnitStatus.INACTIVE).count(),
                "roles": CompanyRole.objects.filter(company=company).count(),
                "custom_roles": CompanyRole.objects.filter(company=company, is_system=False).count(),
                "installed_modules": installed,
                "available_modules": max(available - installed, 0),
                "pending_invitations": invitations.count(),
                "module_issues": issues,
                "activity": activity,
            }
        )


class MembershipListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        require_permission(request.user, company_id, "membership.view")
        status = request.query_params.get("status") or ""
        role_id = request.query_params.get("role") or ""
        query = (request.query_params.get("q") or "").strip().lower()
        rows = CompanyMembership.objects.filter(company_id=company_id).select_related("user", "person", "person__department", "company").prefetch_related("role_assignments__role")
        if status:
            rows = rows.filter(status=status)
        if role_id:
            rows = rows.filter(role_assignments__role_id=role_id)
        if query:
            rows = rows.filter(Q(user__email__icontains=query) | Q(user__first_name__icontains=query) | Q(user__last_name__icontains=query))
        results = []
        for membership in rows.order_by("user__email").distinct():
            codes = sorted(effective_permission_codes(membership))
            results.append(
                {
                    "id": str(membership.id),
                    "email": membership.user.email,
                    "first_name": membership.user.first_name,
                    "last_name": membership.user.last_name,
                    "status": membership.status,
                    "roles": [{"id": str(item.role_id), "name": item.role.name} for item in membership.role_assignments.all()],
                    "permissions": codes,
                    "job_title": membership.person.job_title if membership.person_id else "",
                    "organization": membership.person.department.name if membership.person_id and membership.person.department_id else membership.company.display_name,
                    "last_login": membership.user.last_login.isoformat() if membership.user.last_login else None,
                }
            )
        return Response({"results": results})


class InvitationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        require_permission(request.user, company_id, "membership.view")
        rows = MembershipInvitation.objects.filter(company_id=company_id).order_by("-created_at")
        return Response(
            {
                "results": [
                    {"id": str(row.id), "email": row.email, "status": row.status, "expires_at": row.expires_at.isoformat(), "created_at": row.created_at.isoformat()}
                    for row in rows
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "membership.invite")
        email_raw = request.data.get("email")
        if not isinstance(email_raw, str) or "@" not in email_raw:
            raise validation_error([{"field": "email", "code": "invalid", "message": "Enter an email address."}])
        email = normalize_email(email_raw)
        if CompanyMembership.objects.filter(company_id=company_id, user__email=email).exclude(status=MembershipStatus.REMOVED).exists():
            raise conflict("That person already belongs to the company.", [{"field": "email", "code": "unique", "message": "That person already belongs to the company."}])
        if MembershipInvitation.objects.filter(company_id=company_id, email=email, status=InvitationStatus.PENDING).exists():
            raise conflict("An invitation is already pending.", [{"field": "email", "code": "unique", "message": "An invitation is already pending."}])
        token = secrets.token_urlsafe(32)
        invitation = MembershipInvitation.objects.create(
            company_id=company_id,
            email=email,
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            invited_by=request.user,
            expires_at=timezone.now() + timedelta(days=7),
        )
        send_mail(
            "Join a Pulse company",
            f"Open {settings.CORS_ALLOWED_ORIGINS[0] if getattr(settings, 'CORS_ALLOWED_ORIGINS', None) else 'http://localhost:5173'}/invitations/accept?token={token}",
            getattr(settings, "DEFAULT_FROM_EMAIL", None) or "noreply@pulse.local",
            [email],
            fail_silently=True,
        )
        AuditLog.objects.create(
            company_id=company_id,
            actor=request.user,
            action="membership.invited",
            object_type="membership_invitation",
            object_id=invitation.id,
            after={"email": email},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response({"id": str(invitation.id), "email": email, "status": invitation.status}, status=201)


class InvitationActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, invitation_id, action):
        require_permission(request.user, company_id, "membership.invite")
        invitation = MembershipInvitation.objects.filter(company_id=company_id, pk=invitation_id).first()
        if invitation is None:
            raise not_found()
        if action == "revoke":
            previous = invitation.status
            if previous != InvitationStatus.REVOKED:
                with transaction.atomic():
                    invitation.status = InvitationStatus.REVOKED
                    invitation.save(update_fields=["status", "updated_at"])
                    AuditLog.objects.create(
                        company_id=company_id,
                        actor=request.user,
                        action="membership.invitation_revoked",
                        object_type="membership_invitation",
                        object_id=invitation.id,
                        before={"status": previous, "email": invitation.email},
                        after={"status": invitation.status, "email": invitation.email},
                        ip_address=_ip(request),
                        request_id=_request_id(request),
                    )
        elif action == "resend":
            token = secrets.token_urlsafe(32)
            invitation.token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            invitation.status = InvitationStatus.PENDING
            invitation.expires_at = timezone.now() + timedelta(days=7)
            invitation.save(update_fields=["token_hash", "status", "expires_at", "updated_at"])
        else:
            raise not_found()
        return Response({"id": str(invitation.id), "status": invitation.status})


class InvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("token")
        if not isinstance(token, str) or not token.strip():
            raise validation_error([{"field": "token", "code": "required", "message": "This invitation link is not valid."}])
        token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
        invitation = MembershipInvitation.objects.select_related("company").filter(token_hash=token_hash).first()
        if invitation is None or invitation.status != InvitationStatus.PENDING or invitation.expires_at < timezone.now():
            raise conflict("This invitation is no longer valid.")
        if invitation.email != request.user.email:
            raise permission_denied("Sign in with the invited email address.")
        if request.user.email_verified_at is None:
            raise permission_denied("Verify your email address before accepting.")
        with transaction.atomic():
            membership, _created = CompanyMembership.objects.get_or_create(
                company=invitation.company,
                user=request.user,
                defaults={"status": MembershipStatus.ACTIVE, "joined_at": timezone.now()},
            )
            membership.status = MembershipStatus.ACTIVE
            membership.joined_at = membership.joined_at or timezone.now()
            if membership.person_id is None:
                membership.person = Person.objects.create(
                    company=invitation.company,
                    first_name=request.user.first_name,
                    last_name=request.user.last_name,
                    work_email=request.user.email,
                    status=PersonStatus.ACTIVE,
                )
            membership.save()
            employee = CompanyRole.objects.filter(company=invitation.company, template_code="employee").first()
            if employee:
                MembershipRoleAssignment.objects.get_or_create(membership=membership, role=employee, assigned_by=request.user)
            invitation.status = InvitationStatus.ACCEPTED
            invitation.accepted_by = request.user
            invitation.save(update_fields=["status", "accepted_by", "updated_at"])
            AuditLog.objects.create(
                company=invitation.company,
                actor=request.user,
                action="membership.invitation_accepted",
                object_type="membership_invitation",
                object_id=invitation.id,
                before={"status": InvitationStatus.PENDING, "email": invitation.email},
                after={"status": invitation.status, "email": invitation.email, "membership_id": str(membership.id)},
                ip_address=_ip(request),
                request_id=_request_id(request),
            )
        return Response({"company_id": str(invitation.company_id)})


class MembershipStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, membership_id):
        status = request.data.get("status")
        if status == MembershipStatus.REMOVED:
            actor = require_permission(request.user, company_id, "membership.remove")
        elif status in {MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED}:
            actor = require_permission(request.user, company_id, "membership.update")
        else:
            require_membership(request.user, company_id)
            raise validation_error([{"field": "status", "code": "invalid", "message": "Choose active, suspended, or removed."}])
        membership = CompanyMembership.objects.filter(company_id=company_id, pk=membership_id).first()
        if membership is None:
            raise not_found()
        if status != MembershipStatus.ACTIVE:
            assert_owner_remains(membership.company, membership=membership)
        if membership.id == actor.id and status != MembershipStatus.ACTIVE:
            raise conflict("You cannot suspend or remove your own membership from this screen.")
        previous = membership.status
        with transaction.atomic():
            membership.status = status
            if status == MembershipStatus.REMOVED:
                membership.removed_at = timezone.now()
            membership.save()
            if previous != status:
                AuditLog.objects.create(
                    company_id=company_id,
                    actor=request.user,
                    action="membership.status_changed",
                    object_type="company_membership",
                    object_id=membership.id,
                    before={"status": previous},
                    after={"status": status},
                    ip_address=_ip(request),
                    request_id=_request_id(request),
                )
        return Response({"id": str(membership.id), "status": membership.status})


class MembershipRolesView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, company_id, membership_id):
        actor = require_permission(request.user, company_id, "roles.manage")
        membership = CompanyMembership.objects.filter(company_id=company_id, pk=membership_id).first()
        if membership is None:
            raise not_found()
        role_ids = _role_ids(request.data.get("role_ids"))
        roles = list(CompanyRole.objects.filter(company_id=company_id, pk__in=role_ids))
        if len(roles) != len(role_ids):
            raise not_found("One of those roles was not found.")
        authorize_owner_role_change(actor_membership=actor, target_membership=membership, roles=roles)
        previous = sorted(
            str(role_id)
            for role_id in MembershipRoleAssignment.objects.filter(membership=membership).values_list("role_id", flat=True)
        )
        with transaction.atomic():
            MembershipRoleAssignment.objects.filter(membership=membership).exclude(role__in=roles).delete()
            for role in roles:
                MembershipRoleAssignment.objects.get_or_create(membership=membership, role=role, assigned_by=request.user)
            current = sorted(str(role.id) for role in roles)
            if previous != current:
                AuditLog.objects.create(
                    company_id=company_id,
                    actor=request.user,
                    action="membership.roles_changed",
                    object_type="company_membership",
                    object_id=membership.id,
                    before={"role_ids": previous},
                    after={"role_ids": current},
                    ip_address=_ip(request),
                    request_id=_request_id(request),
                )
        return Response({"id": str(membership.id), "role_ids": [str(role.id) for role in roles]})


class CompanySettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        company = membership.company
        billing = getattr(company, "billing_profile", None)
        return Response(
            {
                "legal_name": company.legal_name,
                "display_name": company.display_name,
                "slug": company.slug,
                "timezone": company.timezone,
                "subscription": subscription_summary(company),
                "billing_name": billing.billing_name if billing else "",
                "billing_email": billing.billing_email if billing else "",
            }
        )

    def patch(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.update")
        company = membership.company
        display_name = request.data.get("display_name")
        timezone_name = request.data.get("timezone")
        if isinstance(display_name, str) and display_name.strip():
            company.display_name = display_name.strip()[:255]
        if isinstance(timezone_name, str) and timezone_name.strip():
            company.timezone = timezone_name.strip()[:64]
        company.save(update_fields=["display_name", "timezone", "updated_at"])
        AuditLog.objects.create(
            company=company,
            actor=request.user,
            action="company.updated",
            object_type="company",
            object_id=company.id,
            after={"display_name": company.display_name, "timezone": company.timezone},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response({"saved": True})


class AuditListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        require_permission(request.user, company_id, "audit.view")
        from apps.audit.company_log import company_audit

        return Response(company_audit(company_id, request.query_params))
