import hashlib
import secrets
import smtplib
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog, AuditScope, PLATFORM_ACTIONS
from apps.authorization.company import (
    assert_owner_remains,
    authorize_owner_role_change,
    bootstrap_company_access,
    effective_permission_codes,
    require_membership,
    require_permission,
)
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.billing.access import access_mode, current_subscription
from apps.billing.services import subscription_summary
from apps.dashboards.services import dashboard_for_membership, navigation_for
from apps.identity.serializers import normalize_email
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.modules_registry.services import catalog_for_company
from apps.organization.models import Department, Person, PersonStatus, UnitStatus
from apps.tenants.invitations import accept_invitation, join_with_invitation, load_pending_invitation, preview_invitation
from apps.tenants.models import CompanyMembership, CompanyStatus, InvitationStatus, MembershipInvitation, MembershipStatus
from apps.tenants.services import _ip, _request_id, company_settings_payload, update_company_settings
from common.api.errors import conflict, not_found, permission_denied, validation_error
from common.api.exceptions import PulseAPIException


def _send_invitation_email(*, email: str, token: str) -> None:
    link = f"{settings.FRONTEND_ORIGIN}/invitations/accept?token={token}"
    try:
        send_mail(
            subject="Join a Pulse company",
            message=(
                "You were invited to join a company on Pulse.\n\n"
                "Open this link to create your password (or sign in) and enter the company dashboard:\n"
                f"{link}\n"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except (OSError, smtplib.SMTPException) as exc:
        raise PulseAPIException(
            code="email_delivery_failed",
            message="The invitation message could not be delivered to that inbox.",
            status_code=502,
        ) from exc


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


ACTIVE_COMPANY_SESSION_KEY = "active_company_id"


def remember_active_company(request, company_id) -> None:
    request.session[ACTIVE_COMPANY_SESSION_KEY] = str(company_id)


def _company_for(request):
    user = request.user
    queryset = (
        CompanyMembership.objects.select_related("company")
        .filter(user=user, status=MembershipStatus.ACTIVE)
        .order_by("created_at", "id")
    )
    membership = None
    raw = request.session.get(ACTIVE_COMPANY_SESSION_KEY)
    if raw:
        try:
            company_id = uuid.UUID(str(raw))
        except (ValueError, TypeError, AttributeError):
            company_id = None
        if company_id is not None:
            membership = queryset.filter(company_id=company_id).first()
        if membership is None:
            request.session.pop(ACTIVE_COMPANY_SESSION_KEY, None)
    if membership is None:
        membership = queryset.first()
    if membership is None:
        raise not_found("Create a company before opening the dashboard.")
    bootstrap_company_access(membership.company, membership.company.created_by or user)
    return membership


def _workspace_membership(user, membership):
    """Open the shell for an active member. A healthy subscription does not also require company.view."""
    mode = access_mode(membership.company, current_subscription(membership.company))
    if mode in {"full", "grace"}:
        return require_membership(user, membership.company_id)
    return require_permission(user, membership.company_id, "company.view")


def _workspace_payload(membership) -> dict:
    company = membership.company
    is_blocked = company.status in {CompanyStatus.SUSPENDED, CompanyStatus.CLOSED}
    status_reason = None
    if company.status == CompanyStatus.SUSPENDED:
        log = AuditLog.objects.filter(company=company, action="company.suspended").order_by("-created_at").first()
        if log and isinstance(log.after, dict):
            status_reason = log.after.get("reason")
        if not status_reason and isinstance(company.custom_data, dict):
            status_reason = company.custom_data.get("suspension_reason")
    elif company.status == CompanyStatus.CLOSED:
        log = AuditLog.objects.filter(company=company, action="company.closed").order_by("-created_at").first()
        if log and isinstance(log.after, dict):
            status_reason = log.after.get("reason")
        if not status_reason and isinstance(company.custom_data, dict):
            status_reason = company.custom_data.get("closure_reason")

    return {
        "company": {
            "id": str(company.id),
            "legal_name": company.legal_name,
            "display_name": company.display_name,
            "slug": company.slug,
            "status": company.status,
            "timezone": company.timezone,
            "suspended_at": company.suspended_at.isoformat() if company.suspended_at else None,
            "closed_at": company.closed_at.isoformat() if company.closed_at else None,
            "status_reason": status_reason,
        },
        "permissions": [] if is_blocked else sorted(effective_permission_codes(membership)),
        "navigation": [] if is_blocked else navigation_for(membership),
        "subscription": subscription_summary(company),
        "dashboard": {"widgets": []} if is_blocked else dashboard_for_membership(membership),
    }


def _open_workspace(request):
    membership = _company_for(request)
    if membership.company.status in {CompanyStatus.SUSPENDED, CompanyStatus.CLOSED}:
        return membership
    return _workspace_membership(request.user, membership)


class WorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_workspace_payload(_open_workspace(request)))


class WorkspaceSwitchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw = request.data.get("company_id")
        if not isinstance(raw, str) or not raw.strip():
            raise validation_error([{"field": "company_id", "code": "required", "message": "Choose a company."}])
        try:
            company_id = uuid.UUID(raw.strip())
        except ValueError:
            raise validation_error([{"field": "company_id", "code": "invalid", "message": "Choose a company."}]) from None
        membership = (
            CompanyMembership.objects.select_related("company")
            .filter(user=request.user, company_id=company_id, status=MembershipStatus.ACTIVE)
            .first()
        )
        if membership is None:
            raise not_found()
        if membership.company.status in {CompanyStatus.SUSPENDED, CompanyStatus.CLOSED}:
            opened = membership
        else:
            opened = _workspace_membership(request.user, membership)
        bootstrap_company_access(opened.company, opened.company.created_by or request.user)
        remember_active_company(request, opened.company_id)
        return Response(_workspace_payload(opened))


class WorkspaceEnterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        membership = _company_for(request)
        if membership.company.status in {CompanyStatus.SUSPENDED, CompanyStatus.CLOSED}:
            return Response({"entered": False, "status": membership.company.status})
        state = getattr(membership.company, "onboarding_state", None)
        if state and state.workspace_entered_at is None and state.subscription_activated_at:
            state.workspace_entered_at = timezone.now()
            state.save(update_fields=["workspace_entered_at", "updated_at"])
        return Response({"entered": True})


class OverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        membership = require_permission(request.user, _company_for(request).company_id, "company.view")
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
        company_member_ids = set(
            CompanyMembership.objects.filter(company=company).values_list("user_id", flat=True)
        )
        recent_logs = (
            AuditLog.objects.filter(company=company, scope=AuditScope.COMPANY)
            .exclude(action__startswith="platform.")
            .exclude(action__in=PLATFORM_ACTIONS)
            .select_related("actor")
            .order_by("-created_at")[:8]
        )
        for row in recent_logs:
            actor_name = "System"
            actor_email = None
            if row.actor_id and row.actor_id in company_member_ids:
                actor_name = f"{row.actor.first_name} {row.actor.last_name}".strip() or row.actor.email
                actor_email = row.actor.email
            activity.append(
                {
                    "action": row.action,
                    "object_type": row.object_type,
                    "created_at": row.created_at.isoformat(),
                    "actor_email": actor_email,
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
                    # "updated_at": company.updated_at.isoformat() if company.updated_at else None  
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


def _invitation_payload(row, *, permission_codes):
    from apps.tenants.custom_data_access import load_active_definitions, serialize_custom_data
    from apps.tenants.models import FieldEntity

    return {
        "id": str(row.id),
        "email": row.email,
        "person_id": str(row.person_id) if row.person_id else None,
        "person_name": f"{row.person.first_name} {row.person.last_name}".strip() if row.person_id else "",
        "status": row.status,
        "expires_at": row.expires_at.isoformat(),
        "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
        "created_at": row.created_at.isoformat(),
        "custom_data": serialize_custom_data(
            load_active_definitions(row.company, FieldEntity.INVITATION),
            row.custom_data or {},
            entity=FieldEntity.INVITATION,
            permission_codes=permission_codes,
        ),
    }


def _membership_payload(membership, *, viewer_codes):
    from apps.tenants.custom_data_access import load_active_definitions, serialize_custom_data
    from apps.tenants.models import FieldEntity

    codes = sorted(effective_permission_codes(membership))
    return {
        "id": str(membership.id),
        "email": membership.user.email,
        "first_name": membership.user.first_name,
        "last_name": membership.user.last_name,
        "status": membership.status,
        "roles": [
            {"id": str(item.role_id), "name": item.role.name, "is_owner_role": item.role.is_owner_role}
            for item in membership.role_assignments.all()
        ],
        "permissions": codes,
        "job_title": membership.person.job_title if membership.person_id else "",
        "organization": membership.person.department.name
        if membership.person_id and membership.person.department_id
        else membership.company.display_name,
        "last_login": membership.user.last_login.isoformat() if membership.user.last_login else None,
        "custom_data": serialize_custom_data(
            load_active_definitions(membership.company, FieldEntity.MEMBERSHIP),
            membership.custom_data or {},
            entity=FieldEntity.MEMBERSHIP,
            permission_codes=viewer_codes,
        ),
    }


class MembershipListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        viewer = require_permission(request.user, company_id, "membership.view")
        viewer_codes = effective_permission_codes(viewer)
        status = request.query_params.get("status") or ""
        role_id = request.query_params.get("role") or ""
        query = (request.query_params.get("q") or "").strip().lower()
        rows = CompanyMembership.objects.filter(company_id=company_id).select_related(
            "user", "person", "person__department", "company"
        ).prefetch_related("role_assignments__role")
        if status:
            rows = rows.filter(status=status)
        if role_id:
            rows = rows.filter(role_assignments__role_id=role_id)
        if query:
            rows = rows.filter(Q(user__email__icontains=query) | Q(user__first_name__icontains=query) | Q(user__last_name__icontains=query))
        results = [_membership_payload(row, viewer_codes=viewer_codes) for row in rows.order_by("user__email").distinct()]
        return Response({"results": results})


class MembershipDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, membership_id):
        viewer = require_permission(request.user, company_id, "membership.update")
        viewer_codes = effective_permission_codes(viewer)
        membership = (
            CompanyMembership.objects.filter(company_id=company_id, pk=membership_id)
            .select_related("user", "person", "person__department", "company")
            .prefetch_related("role_assignments__role")
            .first()
        )
        if membership is None:
            raise not_found("That membership was not found.")
        if "custom_data" not in request.data:
            raise validation_error([{"field": "custom_data", "code": "required", "message": "Send custom field values."}])
        from apps.tenants.custom_fields import normalize_custom_data
        from apps.tenants.models import FieldEntity

        before = dict(membership.custom_data or {})
        membership.custom_data = normalize_custom_data(
            membership.company,
            FieldEntity.MEMBERSHIP,
            request.data.get("custom_data"),
            creating=False,
            existing=membership.custom_data or {},
            permission_codes=viewer_codes,
        )
        membership.save(update_fields=["custom_data", "updated_at"])
        AuditLog.objects.create(
            company_id=company_id,
            actor=request.user,
            action="membership.updated",
            object_type="company_membership",
            object_id=membership.id,
            before={"custom_data": before},
            after={"custom_data": dict(membership.custom_data or {})},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response(_membership_payload(membership, viewer_codes=viewer_codes))


class InvitationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "membership.view")
        codes = effective_permission_codes(membership)
        rows = MembershipInvitation.objects.filter(company_id=company_id).select_related("company").order_by("-created_at")
        return Response({"results": [_invitation_payload(row, permission_codes=codes) for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "membership.invite")
        codes = effective_permission_codes(membership)
        payload = request.data
        if not isinstance(payload, dict):
            raise validation_error(
                [{"field": "", "code": "invalid", "message": "Send a JSON object with an email address."}]
            )
        email_raw = payload.get("email")
        if not isinstance(email_raw, str) or "@" not in email_raw:
            raise validation_error([{"field": "email", "code": "invalid", "message": "Enter an email address."}])
        email = normalize_email(email_raw)
        if (
            CompanyMembership.objects.filter(company_id=company_id, user__email__iexact=email)
            .exclude(status=MembershipStatus.REMOVED)
            .exists()
        ):
            raise conflict(
                "That person already belongs to the company. No invitation is needed.",
                [{"field": "email", "code": "unique", "message": "That person already belongs to the company. No invitation is needed."}],
            )
        if Person.objects.filter(company_id=company_id, work_email__iexact=email, status=PersonStatus.INACTIVE).exists():
            raise conflict(
                "That person is inactive. Reactivate them before sending an invitation.",
                [{"field": "email", "code": "inactive", "message": "That person is inactive. Reactivate them before sending an invitation."}],
            )
        if MembershipInvitation.objects.filter(company_id=company_id, email=email, status=InvitationStatus.PENDING).exists():
            raise conflict("An invitation is already pending.", [{"field": "email", "code": "unique", "message": "An invitation is already pending."}])
        person_id = payload.get("person_id")
        target_person = None
        if person_id:
            target_person = Person.objects.filter(company_id=company_id, pk=person_id).first()
            if target_person is None:
                raise not_found("That Person was not found in this company.")
            if target_person.status != PersonStatus.ACTIVE:
                raise conflict("That Person is inactive. Reactivate them before sending an invitation.")
            if target_person.work_email and normalize_email(target_person.work_email) != email:
                raise validation_error([{"field": "person_id", "code": "email_mismatch", "message": "The selected Person's work email must match the invitation."}])
        else:
            matching_people = list(
                Person.objects.filter(company_id=company_id, work_email__iexact=email).order_by("created_at")[:2]
            )
            if len(matching_people) > 1:
                raise conflict("More than one Person matches this email. Select the intended Person explicitly.")
            target_person = matching_people[0] if matching_people else None
        from apps.tenants.custom_fields import normalize_custom_data
        from apps.tenants.models import FieldEntity

        custom_data = normalize_custom_data(
            membership.company,
            FieldEntity.INVITATION,
            payload.get("custom_data") if "custom_data" in payload else None,
            creating=True,
            existing={},
            permission_codes=codes,
        )
        token = secrets.token_urlsafe(32)
        _send_invitation_email(email=email, token=token)
        invitation = MembershipInvitation.objects.create(
            company_id=company_id,
            person=target_person,
            email=email,
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            invited_by=request.user,
            expires_at=timezone.now() + timedelta(days=7),
            custom_data=custom_data,
        )
        AuditLog.objects.create(
            company_id=company_id,
            actor=request.user,
            action="membership.invited",
            object_type="membership_invitation",
            object_id=invitation.id,
            after={"email": email, "custom_data": custom_data},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response(_invitation_payload(invitation, permission_codes=codes), status=201)


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
            if invitation.status == InvitationStatus.ACCEPTED:
                raise conflict("That invitation was already accepted.")
            if invitation.status == InvitationStatus.REVOKED:
                raise conflict("That invitation was revoked. Send a new invitation instead.")
            token = secrets.token_urlsafe(32)
            # Deliver first so a failed send does not invalidate the previous link.
            _send_invitation_email(email=invitation.email, token=token)
            invitation.token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            invitation.status = InvitationStatus.PENDING
            invitation.expires_at = timezone.now() + timedelta(days=7)
            invitation.save(update_fields=["token_hash", "status", "expires_at", "updated_at"])
            AuditLog.objects.create(
                company_id=company_id,
                actor=request.user,
                action="membership.invitation_resent",
                object_type="membership_invitation",
                object_id=invitation.id,
                after={"email": invitation.email},
                ip_address=_ip(request),
                request_id=_request_id(request),
            )
        else:
            raise not_found()
        return Response({"id": str(invitation.id), "status": invitation.status})


class InvitationPreviewView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(preview_invitation(request.query_params.get("token")))


class InvitationJoinView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        payload = join_with_invitation(
            request=request,
            token=request.data.get("token"),
            password=request.data.get("password"),
        )
        remember_active_company(request, payload["company_id"])
        return Response(payload)


class InvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        invitation = load_pending_invitation(request.data.get("token"))
        result = accept_invitation(request=request, invitation=invitation, user=request.user)
        remember_active_company(request, result["company_id"])
        return Response(result)


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
        codes = effective_permission_codes(membership)
        return Response(company_settings_payload(membership.company, permission_codes=codes))

    def patch(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.update")
        payload = update_company_settings(company=membership.company, payload=request.data, request=request)
        return Response({"saved": True, **payload})


class AuditListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        require_permission(request.user, company_id, "audit.view")
        from apps.audit.company_log import company_audit

        return Response(company_audit(company_id, request.query_params))
