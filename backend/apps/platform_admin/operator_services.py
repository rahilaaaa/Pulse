import hashlib
import secrets
from datetime import datetime, timedelta, timezone as datetime_timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.audit.models import AuditLog, AuditScope
from apps.authorization.catalog import PLATFORM_PERMISSIONS
from apps.authorization.models import (
    OperatorStatus,
    Permission,
    PermissionScope,
    PlatformInvitation,
    PlatformInvitationStatus,
    PlatformOperatorProfile,
    PlatformPermissionGrant,
    PlatformRole,
    PlatformRolePermission,
    PlatformSuperAdmin,
)
from apps.authorization.services import (
    ensure_not_super_admin_target,
    ensure_platform_catalog,
    ensure_super_admin_actor,
    get_operator_profile,
    get_super_admin,
    is_super_admin,
    normalize_permission_codes,
    platform_permission_codes,
    sync_platform_grants,
)
from apps.identity.password_reset import _issue_reset
from apps.identity.serializers import normalize_email
from apps.tenants.models import CompanyMembership, MembershipStatus
from common.api.errors import conflict, not_found, permission_denied, validation_error
from common.api.pagination import page_errors, paginate

User = get_user_model()

RESERVED_ROLE_SLUGS = {"super-admin", "superadmin", "super_admin", "owner", "root"}


def _iso(value):
    if value is None:
        return None
    return value.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z")


def _request_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.META.get("REMOTE_ADDR") or "")[:64] or None


def _request_id(request):
    if request is None:
        return None
    raw = request.META.get("HTTP_X_REQUEST_ID") or request.headers.get("X-Request-Id")
    if not raw:
        return None
    try:
        import uuid
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return None


def invalidate_user_sessions(user):
    """Increment operator session version and remove active DB sessions."""
    profile = get_operator_profile(user)
    if profile is not None:
        profile.session_version += 1
        profile.save(update_fields=["session_version", "updated_at"])

    # Flush database sessions matching this user id
    user_id_str = str(user.id)
    try:
        now = timezone.now()
        for session in Session.objects.filter(expire_date__gt=now):
            try:
                data = session.get_decoded()
                if str(data.get("_auth_user_id")) == user_id_str:
                    session.delete()
            except Exception:
                pass
    except Exception:
        pass


# ==============================================================================
# 1. DYNAMIC PLATFORM ROLE MANAGEMENT
# ==============================================================================

def list_platform_roles(*, query_params: dict) -> dict:
    ensure_platform_catalog()
    queryset = PlatformRole.objects.annotate(
        assigned_operators_count=Count("operators", distinct=True)
    ).select_related("created_by")

    search = (query_params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search) | Q(description__icontains=search))

    sort = query_params.get("sort") or "name"
    sort_fields = {
        "name": ("name", "id"),
        "-name": ("-name", "id"),
        "created_at": ("created_at", "id"),
        "-created_at": ("-created_at", "id"),
    }
    order_by = sort_fields.get(sort, ("name", "id"))

    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)

    page = paginate(queryset.order_by(*order_by), page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [_serialize_platform_role(role, include_permissions=True) for role in page["results"]]
    return page


def _serialize_platform_role(role: PlatformRole, *, include_permissions: bool = False, include_operators: bool = False) -> dict:
    operator_count = getattr(role, "assigned_operators_count", None)
    if operator_count is None:
        operator_count = role.operators.count()

    payload = {
        "id": str(role.id),
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
        "assigned_operators_count": operator_count,
        "created_by": {
            "id": str(role.created_by.id),
            "email": role.created_by.email,
            "name": f"{role.created_by.first_name} {role.created_by.last_name}".strip(),
        } if role.created_by else None,
        "created_at": _iso(role.created_at),
        "updated_at": _iso(role.updated_at),
    }

    if include_permissions:
        perms = role.role_permissions.select_related("permission").all()
        payload["permission_codes"] = sorted([p.permission_id for p in perms])
        payload["permissions"] = [
            {"code": p.permission_id, "description": p.permission.description} for p in perms
        ]

    if include_operators:
        ops = []
        for profile in role.operators.select_related("user").all():
            ops.append({
                "id": str(profile.user.id),
                "email": profile.user.email,
                "first_name": profile.user.first_name,
                "last_name": profile.user.last_name,
                "status": profile.status,
                "is_active": profile.user.is_active,
                "last_login": _iso(profile.user.last_login),
            })
        payload["assigned_operators"] = ops

    return payload


def create_platform_role(*, actor: User, payload: dict, request) -> dict:
    ensure_super_admin_actor(actor, "create platform roles")
    ensure_platform_catalog()

    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Role name is required."}])
    name = name.strip()
    if len(name) > 150:
        raise validation_error([{"field": "name", "code": "max_length", "message": "Role name must be 150 characters or fewer."}])

    slug = payload.get("slug")
    if not slug:
        from django.utils.text import slugify
        slug = slugify(name)
    else:
        slug = str(slug).strip().lower()

    if slug in RESERVED_ROLE_SLUGS or "super-admin" in slug or "superadmin" in slug:
        raise validation_error([
            {"field": "name", "code": "reserved", "message": "The Super Admin role cannot be dynamically created or modified."}
        ])

    if PlatformRole.objects.filter(Q(name__iexact=name) | Q(slug__iexact=slug)).exists():
        raise conflict(
            "A platform role with this name or slug already exists.",
            [{"field": "name", "code": "duplicate", "message": "A platform role with this name or slug already exists."}],
        )

    description = payload.get("description", "")
    if description is None:
        description = ""
    elif not isinstance(description, str):
        raise validation_error([{"field": "description", "code": "invalid", "message": "Enter a valid description."}])

    codes = normalize_permission_codes(payload.get("permission_codes"))
    if not codes:
        raise validation_error([
            {"field": "permission_codes", "code": "required", "message": "Choose at least one platform permission. Roles cannot be empty."}
        ])

    with transaction.atomic():
        role = PlatformRole.objects.create(
            name=name,
            slug=slug,
            description=description,
            created_by=actor,
        )
        for code in codes:
            PlatformRolePermission.objects.create(role=role, permission_id=code)

        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.role.created",
            object_type="role",
            object_id=role.id,
            after={
                "name": role.name,
                "slug": role.slug,
                "description": role.description,
                "permission_codes": codes,
            },
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return _serialize_platform_role(role, include_permissions=True)


def get_platform_role_detail(*, role_id) -> dict:
    role = PlatformRole.objects.annotate(
        assigned_operators_count=Count("operators", distinct=True)
    ).select_related("created_by").filter(pk=role_id).first()

    if role is None:
        raise not_found("That platform role was not found.")
    return _serialize_platform_role(role, include_permissions=True, include_operators=True)


def update_platform_role(*, actor: User, role_id, payload: dict, request) -> dict:
    ensure_super_admin_actor(actor, "edit platform roles")
    ensure_platform_catalog()

    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    role = PlatformRole.objects.filter(pk=role_id).first()
    if role is None:
        raise not_found("That platform role was not found.")

    before_state = {
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
        "permission_codes": sorted(role.role_permissions.values_list("permission_id", flat=True)),
    }

    updates = []
    if "name" in payload:
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise validation_error([{"field": "name", "code": "required", "message": "Role name is required."}])
        name = name.strip()
        if len(name) > 150:
            raise validation_error([{"field": "name", "code": "max_length", "message": "Role name must be 150 characters or fewer."}])
        if name.lower() in ("super admin", "superadmin"):
            raise validation_error([{"field": "name", "code": "reserved", "message": "Cannot name a role Super Admin."}])
        if PlatformRole.objects.filter(name__iexact=name).exclude(pk=role.id).exists():
            raise conflict("A role with that name already exists.", [{"field": "name", "code": "duplicate", "message": "A role with that name already exists."}])
        role.name = name
        updates.append("name")

    if "description" in payload:
        desc = payload.get("description")
        if desc is None:
            desc = ""
        elif not isinstance(desc, str):
            raise validation_error([{"field": "description", "code": "invalid", "message": "Enter a valid description."}])
        role.description = desc
        updates.append("description")

    new_codes = None
    if "permission_codes" in payload:
        new_codes = normalize_permission_codes(payload.get("permission_codes"))
        if not new_codes:
            raise validation_error([
                {"field": "permission_codes", "code": "required", "message": "Choose at least one platform permission. Roles cannot be empty."}
            ])

    with transaction.atomic():
        if updates:
            updates.append("updated_at")
            role.save(update_fields=updates)

        perms_changed = False
        if new_codes is not None:
            current_codes = set(role.role_permissions.values_list("permission_id", flat=True))
            if current_codes != set(new_codes):
                perms_changed = True
                role.role_permissions.all().delete()
                for code in new_codes:
                    PlatformRolePermission.objects.create(role=role, permission_id=code)

                # Invalidate active sessions for all operators of this role so changes take effect immediately
                for op_profile in role.operators.select_related("user").all():
                    op_profile.session_version += 1
                    op_profile.save(update_fields=["session_version", "updated_at"])

        after_state = {
            "name": role.name,
            "slug": role.slug,
            "description": role.description,
            "permission_codes": sorted(role.role_permissions.values_list("permission_id", flat=True)),
        }

        if before_state != after_state:
            AuditLog.objects.create(
                company=None,
                actor=actor,
                scope=AuditScope.PLATFORM,
                action="platform.role.updated",
                object_type="role",
                object_id=role.id,
                before=before_state,
                after=after_state,
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )

    return get_platform_role_detail(role_id=role.id)


def delete_platform_role(*, actor: User, role_id, request) -> dict:
    ensure_super_admin_actor(actor, "delete platform roles")

    role = PlatformRole.objects.filter(pk=role_id).first()
    if role is None:
        raise not_found("That platform role was not found.")

    # Rule: Do not allow deleting a role that is currently assigned to operators.
    assigned_count = role.operators.count()
    if assigned_count > 0:
        raise conflict(
            f"Cannot delete role '{role.name}' because it is assigned to {assigned_count} operator(s). Reassign them first.",
            [{"field": "role", "code": "assigned", "message": f"Cannot delete role assigned to {assigned_count} operator(s)."}],
        )

    # Check pending invitations assigned to this role
    pending_invites = role.invitations.filter(status=PlatformInvitationStatus.PENDING).count()
    if pending_invites > 0:
        raise conflict(
            f"Cannot delete role '{role.name}' because it is assigned to {pending_invites} pending invitation(s). Revoke them first.",
            [{"field": "role", "code": "pending_invites", "message": f"Cannot delete role assigned to {pending_invites} pending invitation(s)."}],
        )

    before_state = {
        "id": str(role.id),
        "name": role.name,
        "slug": role.slug,
        "description": role.description,
    }

    with transaction.atomic():
        role.delete()
        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.role.deleted",
            object_type="role",
            object_id=role.id,
            before=before_state,
            after={"deleted": True},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return {"deleted": True, "id": str(role.id)}


# ==============================================================================
# 2. SUPER ADMIN PROTECTION & OWNERSHIP TRANSFER
# ==============================================================================

def transfer_super_admin_ownership(*, actor: User, payload: dict, request) -> dict:
    """Secure procedure to transfer the single Super Admin ownership to an active platform operator."""
    if not is_super_admin(actor):
        raise permission_denied("Only the current Super Admin can initiate ownership transfer.")

    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    # 1. Identity verification via password check
    password = payload.get("password")
    if not password or not actor.check_password(str(password)):
        raise validation_error([
            {"field": "password", "code": "invalid", "message": "Incorrect current Super Admin password."}
        ])

    # 2. Confirmation flag
    confirm = payload.get("confirm_transfer")
    if confirm is not True:
        raise validation_error([
            {"field": "confirm_transfer", "code": "required", "message": "You must confirm ownership transfer."}
        ])

    target_user_id = payload.get("target_user_id")
    if not target_user_id:
        raise validation_error([
            {"field": "target_user_id", "code": "required", "message": "Select a target operator."}
        ])

    target_user = User.objects.filter(pk=target_user_id).first()
    if target_user is None:
        raise not_found("Target operator not found.")

    if target_user.id == actor.id:
        raise conflict(
            "You are already the Super Admin.",
            [{"field": "target_user_id", "code": "self", "message": "Target user is current Super Admin."}],
        )

    if not target_user.is_active:
        raise conflict(
            "Cannot transfer Super Admin ownership to an inactive user.",
            [{"field": "target_user_id", "code": "inactive", "message": "Target account is inactive."}],
        )

    target_profile = get_operator_profile(target_user)
    if target_profile is None or target_profile.status != OperatorStatus.ACTIVE:
        raise conflict(
            "Target user must be an active platform operator.",
            [{"field": "target_user_id", "code": "not_active_operator", "message": "Target user is not an active operator."}],
        )

    # Former admin fallback role
    former_role = None
    former_role_id = payload.get("former_admin_role_id")
    if former_role_id:
        former_role = PlatformRole.objects.filter(pk=former_role_id).first()
        if former_role is None:
            raise not_found("Selected fallback role for outgoing admin was not found.")

    reason = str(payload.get("reason", "Super Admin ownership transfer")).strip()

    with transaction.atomic():
        # Acquire row lock on the singleton Super Admin record
        super_admin_record = PlatformSuperAdmin.objects.select_for_update().get(id=1)

        actor_profile = get_operator_profile(actor)
        if actor_profile is None:
            actor_profile = PlatformOperatorProfile.objects.create(user=actor, is_super_admin=True)

        # Update singleton record to point to target_user
        super_admin_record.user = target_user
        super_admin_record.save()

        # Update profiles
        actor_profile.is_super_admin = False
        actor_profile.role = former_role
        actor_profile.save()

        target_profile.is_super_admin = True
        target_profile.role = None
        target_profile.save()

        # Audit event
        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.super_admin.transferred",
            object_type="user",
            object_id=target_user.id,
            before={"previous_super_admin": actor.email, "previous_super_admin_id": str(actor.id)},
            after={"new_super_admin": target_user.email, "new_super_admin_id": str(target_user.id), "reason": reason},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

        # Invalidate sessions for both users to ensure fresh permissions
        invalidate_user_sessions(actor)
        invalidate_user_sessions(target_user)

    return {
        "transferred": True,
        "previous_super_admin": actor.email,
        "new_super_admin": target_user.email,
    }


# ==============================================================================
# 3. PLATFORM OPERATOR INVITATIONS
# ==============================================================================

def create_platform_invitation(*, actor: User, payload: dict, request) -> dict:
    ensure_super_admin_actor(actor, "invite platform operators")

    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    email_raw = payload.get("email")
    if not isinstance(email_raw, str) or "@" not in email_raw:
        raise validation_error([{"field": "email", "code": "invalid", "message": "Enter a valid email address."}])
    email = normalize_email(email_raw)

    first_name = str(payload.get("first_name", "") or "").strip()[:150]
    last_name = str(payload.get("last_name", "") or "").strip()[:150]

    role_id = payload.get("role_id")
    if not role_id:
        raise validation_error([{"field": "role_id", "code": "required", "message": "Select a platform role."}])
    role = PlatformRole.objects.filter(pk=role_id).first()
    if role is None:
        raise not_found("Selected platform role was not found.")

    custom_permissions = []
    if "custom_permissions" in payload:
        custom_permissions = normalize_permission_codes(payload.get("custom_permissions"))

    # Check if there is already an active platform operator with this email
    existing_user = User.objects.filter(email=email).first()
    if existing_user:
        if is_super_admin(existing_user):
            raise conflict("That email belongs to the Super Admin.", [{"field": "email", "code": "super_admin", "message": "That email belongs to the Super Admin."}])
        existing_profile = get_operator_profile(existing_user)
        if existing_profile and existing_profile.status == OperatorStatus.ACTIVE:
            raise conflict("That user is already an active platform operator.", [{"field": "email", "code": "already_operator", "message": "That user is already an active platform operator."}])

    # Check pending invitation
    if PlatformInvitation.objects.filter(email=email, status=PlatformInvitationStatus.PENDING).exists():
        raise conflict(
            "A pending invitation already exists for this email. You can resend or revoke it.",
            [{"field": "email", "code": "pending_invite_exists", "message": "A pending invitation already exists for this email."}],
        )

    # Secure single-use token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = timezone.now() + timedelta(days=7)

    with transaction.atomic():
        invitation = PlatformInvitation.objects.create(
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            custom_permissions=custom_permissions,
            status=PlatformInvitationStatus.PENDING,
            token_hash=token_hash,
            invited_by=actor,
            expires_at=expires_at,
        )

        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.operator.invited",
            object_type="invitation",
            object_id=invitation.id,
            after={
                "email": invitation.email,
                "first_name": invitation.first_name,
                "last_name": invitation.last_name,
                "role_id": str(role.id),
                "role_name": role.name,
                "custom_permissions": custom_permissions,
                "expires_at": _iso(expires_at),
            },
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    # Send invitation email with single-use link
    link = f"http://localhost:5173/invitations/accept?token={raw_token}&platform=true"
    mail.send_mail(
        subject="You are invited as a Pulse Platform Operator",
        message=(
            f"Hello {first_name or email},\n\n"
            f"You have been invited by the Pulse Super Admin to join as a Platform Operator with the role '{role.name}'.\n\n"
            f"Click the link below to accept the invitation and choose your password. This link expires in 7 days:\n\n"
            f"{link}\n\n"
            f"If you did not expect this invitation, you can safely ignore this email."
        ),
        from_email="noreply@pulse.local",
        recipient_list=[email],
    )

    return _serialize_platform_invitation(invitation)


def _serialize_platform_invitation(inv: PlatformInvitation) -> dict:
    return {
        "id": str(inv.id),
        "email": inv.email,
        "first_name": inv.first_name,
        "last_name": inv.last_name,
        "role": {
            "id": str(inv.role.id),
            "name": inv.role.name,
            "slug": inv.role.slug,
        } if inv.role else None,
        "custom_permissions": inv.custom_permissions,
        "status": inv.status,
        "invited_by": {
            "id": str(inv.invited_by.id),
            "email": inv.invited_by.email,
        } if inv.invited_by else None,
        "expires_at": _iso(inv.expires_at),
        "created_at": _iso(inv.created_at),
    }


def resend_platform_invitation(*, actor: User, invitation_id, request) -> dict:
    ensure_super_admin_actor(actor, "resend platform invitations")

    invitation = PlatformInvitation.objects.filter(pk=invitation_id).first()
    if invitation is None:
        raise not_found("Invitation not found.")

    if invitation.status != PlatformInvitationStatus.PENDING:
        raise conflict("Only pending invitations can be resent.", [{"field": "status", "code": "not_pending", "message": "Only pending invitations can be resent."}])

    raw_token = secrets.token_urlsafe(32)
    invitation.token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    invitation.expires_at = timezone.now() + timedelta(days=7)
    invitation.save(update_fields=["token_hash", "expires_at", "updated_at"])

    AuditLog.objects.create(
        company=None,
        actor=actor,
        scope=AuditScope.PLATFORM,
        action="platform.operator.invitation_resent",
        object_type="invitation",
        object_id=invitation.id,
        after={"email": invitation.email, "expires_at": _iso(invitation.expires_at)},
        ip_address=_request_ip(request),
        request_id=_request_id(request),
    )

    link = f"http://localhost:5173/invitations/accept?token={raw_token}&platform=true"
    mail.send_mail(
        subject="Reminder: You are invited as a Pulse Platform Operator",
        message=(
            f"Hello {invitation.first_name or invitation.email},\n\n"
            f"This is a reminder that you have been invited to join Pulse as a Platform Operator.\n\n"
            f"Click here to activate your account:\n{link}\n"
        ),
        from_email="noreply@pulse.local",
        recipient_list=[invitation.email],
    )

    return {"resent": True, "id": str(invitation.id)}


def revoke_platform_invitation(*, actor: User, invitation_id, request) -> dict:
    ensure_super_admin_actor(actor, "revoke platform invitations")

    invitation = PlatformInvitation.objects.filter(pk=invitation_id).first()
    if invitation is None:
        raise not_found("Invitation not found.")

    if invitation.status != PlatformInvitationStatus.PENDING:
        raise conflict("Only pending invitations can be revoked.", [{"field": "status", "code": "not_pending", "message": "Only pending invitations can be revoked."}])

    invitation.status = PlatformInvitationStatus.REVOKED
    invitation.save(update_fields=["status", "updated_at"])

    AuditLog.objects.create(
        company=None,
        actor=actor,
        scope=AuditScope.PLATFORM,
        action="platform.operator.invitation_revoked",
        object_type="invitation",
        object_id=invitation.id,
        after={"email": invitation.email, "status": "revoked"},
        ip_address=_request_ip(request),
        request_id=_request_id(request),
    )

    return {"revoked": True, "id": str(invitation.id)}


def verify_platform_invitation(*, token: str) -> dict:
    if not token or not isinstance(token, str):
        raise validation_error([{"field": "token", "code": "required", "message": "Token is required."}])

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    invitation = PlatformInvitation.objects.select_related("role").filter(token_hash=token_hash).first()
    if invitation is None:
        raise not_found("That invitation was not found or the token is invalid.")

    if invitation.status == PlatformInvitationStatus.REVOKED:
        raise validation_error([{"field": "token", "code": "revoked", "message": "This invitation has been revoked."}])

    if invitation.status == PlatformInvitationStatus.ACCEPTED:
        raise validation_error([{"field": "token", "code": "accepted", "message": "This invitation has already been accepted."}])

    if invitation.status != PlatformInvitationStatus.PENDING or timezone.now() > invitation.expires_at:
        invitation.status = PlatformInvitationStatus.EXPIRED
        invitation.save(update_fields=["status", "updated_at"])
        raise validation_error([{"field": "token", "code": "expired", "message": "This invitation has expired."}])

    return {
        "valid": True,
        "email": invitation.email,
        "first_name": invitation.first_name,
        "last_name": invitation.last_name,
        "role_name": invitation.role.name,
        "role_description": invitation.role.description,
    }


def accept_platform_invitation(*, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    raw_token = payload.get("token")
    if not raw_token or not isinstance(raw_token, str):
        raise validation_error([{"field": "token", "code": "required", "message": "Token is required."}])

    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    invitation = PlatformInvitation.objects.select_related("role").filter(token_hash=token_hash).first()
    if invitation is None:
        raise not_found("Invalid invitation token.")

    if invitation.status == PlatformInvitationStatus.REVOKED:
        raise validation_error([{"field": "token", "code": "revoked", "message": "This invitation has been revoked."}])

    if invitation.status == PlatformInvitationStatus.ACCEPTED:
        raise validation_error([{"field": "token", "code": "accepted", "message": "This invitation has already been accepted."}])

    if invitation.status != PlatformInvitationStatus.PENDING or timezone.now() > invitation.expires_at:
        invitation.status = PlatformInvitationStatus.EXPIRED
        invitation.save(update_fields=["status", "updated_at"])
        raise validation_error([{"field": "token", "code": "expired", "message": "This invitation has expired."}])

    password = payload.get("password")
    if not password:
        raise validation_error([{"field": "password", "code": "required", "message": "Password is required."}])
    try:
        validate_password(password)
    except ValidationError as exc:
        raise validation_error([{"field": "password", "code": "invalid", "message": " ".join(exc.messages)}])

    first_name = str(payload.get("first_name", invitation.first_name) or "").strip()[:150]
    last_name = str(payload.get("last_name", invitation.last_name) or "").strip()[:150]

    with transaction.atomic():
        user = User.objects.filter(email=invitation.email).first()
        if user is None:
            user = User.objects.create_user(
                email=invitation.email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                email_verified_at=timezone.now(),
            )
        else:
            user.set_password(password)
            user.first_name = first_name or user.first_name
            user.last_name = last_name or user.last_name
            user.is_active = True
            user.email_verified_at = user.email_verified_at or timezone.now()
            user.save()

        profile, _ = PlatformOperatorProfile.objects.get_or_create(
            user=user,
            defaults={
                "role": invitation.role,
                "status": OperatorStatus.ACTIVE,
                "custom_permissions": invitation.custom_permissions,
            },
        )
        profile.role = invitation.role
        profile.status = OperatorStatus.ACTIVE
        profile.custom_permissions = invitation.custom_permissions
        profile.save()

        invitation.status = PlatformInvitationStatus.ACCEPTED
        invitation.accepted_by = user
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["status", "accepted_by", "accepted_at", "updated_at"])

        AuditLog.objects.create(
            company=None,
            actor=user,
            scope=AuditScope.PLATFORM,
            action="platform.operator.invitation_accepted",
            object_type="invitation",
            object_id=invitation.id,
            after={"email": user.email, "role": invitation.role.name},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return {"accepted": True, "email": user.email}


# ==============================================================================
# 4. PLATFORM OPERATOR LISTING, DETAIL & LIFECYCLE
# ==============================================================================

def list_platform_operators(*, query_params: dict) -> dict:
    ensure_platform_catalog()
    details = page_errors(query_params.get("page"), query_params.get("page_size"))

    # Determine status filter
    status_filter = (query_params.get("status") or "").strip().lower()
    role_filter = (query_params.get("role") or "").strip()
    search = (query_params.get("q") or "").strip()

    # If asking for pending invitations specifically
    if status_filter == "pending":
        return _list_pending_invitations_page(query_params, details)

    # Base operators queryset: users who are Super Admin or have PlatformOperatorProfile or PlatformPermissionGrant
    sa_user_id = PlatformSuperAdmin.objects.values_list("user_id", flat=True).first()

    queryset = User.objects.filter(
        Q(pk=sa_user_id) | Q(platform_profile__isnull=False) | Q(platform_grants__isnull=False)
    ).distinct().select_related("platform_profile__role")

    if search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(platform_profile__role__name__icontains=search)
        )

    if status_filter == "active":
        queryset = queryset.filter(
            Q(pk=sa_user_id) | Q(platform_profile__status=OperatorStatus.ACTIVE),
            is_active=True,
        )
    elif status_filter == "suspended":
        queryset = queryset.filter(platform_profile__status=OperatorStatus.SUSPENDED).exclude(pk=sa_user_id)
    elif status_filter == "deactivated":
        queryset = queryset.filter(
            Q(platform_profile__status=OperatorStatus.DEACTIVATED) | Q(is_active=False)
        ).exclude(pk=sa_user_id)

    if role_filter:
        queryset = queryset.filter(
            Q(platform_profile__role__id=role_filter) | Q(platform_profile__role__slug=role_filter)
        )

    if details:
        raise validation_error(details)

    page = paginate(queryset.order_by("-created_at", "id"), page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [_serialize_operator_row(u, sa_user_id=sa_user_id) for u in page["results"]]
    return page


def _list_pending_invitations_page(query_params, details) -> dict:
    queryset = PlatformInvitation.objects.filter(status=PlatformInvitationStatus.PENDING).select_related("role")
    search = (query_params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))

    role_filter = (query_params.get("role") or "").strip()
    if role_filter:
        queryset = queryset.filter(Q(role__id=role_filter) | Q(role__slug=role_filter))

    if details:
        raise validation_error(details)

    page = paginate(queryset.order_by("-created_at"), page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(inv.id),
            "email": inv.email,
            "first_name": inv.first_name,
            "last_name": inv.last_name,
            "is_super_admin": False,
            "role": {"id": str(inv.role.id), "name": inv.role.name, "slug": inv.role.slug} if inv.role else None,
            "status": "pending",
            "mfa_status": "Disabled",
            "last_login": None,
            "created_at": _iso(inv.created_at),
            "is_invitation": True,
        }
        for inv in page["results"]
    ]
    return page


def _serialize_operator_row(user: User, *, sa_user_id=None) -> dict:
    if sa_user_id is None:
        sa_user_id = PlatformSuperAdmin.objects.values_list("user_id", flat=True).first()

    is_sa = user.id == sa_user_id
    profile = getattr(user, "platform_profile", None)

    if is_sa:
        status = "active"
        role_data = None
    elif profile is not None:
        status = profile.status
        role_data = {
            "id": str(profile.role.id),
            "name": profile.role.name,
            "slug": profile.role.slug,
        } if profile.role else None
    else:
        status = "active" if user.is_active else "deactivated"
        role_data = None

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_super_admin": is_sa,
        "role": role_data,
        "status": status,
        "status_reason": profile.status_reason if profile else "",
        "mfa_status": "Disabled",
        "is_active": user.is_active,
        "last_login": _iso(user.last_login),
        "created_at": _iso(user.created_at),
    }


def get_platform_operator_detail(*, user_id) -> dict:
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        raise not_found("Operator not found.")

    sa_user_id = PlatformSuperAdmin.objects.values_list("user_id", flat=True).first()
    is_sa = user.id == sa_user_id
    profile = get_operator_profile(user)

    payload = _serialize_operator_row(user, sa_user_id=sa_user_id)
    payload["effective_permissions"] = platform_permission_codes(user)

    if profile and profile.role:
        payload["role_permissions"] = sorted(profile.role.role_permissions.values_list("permission_id", flat=True))
    elif is_sa:
        payload["role_permissions"] = payload["effective_permissions"]
    else:
        payload["role_permissions"] = []

    payload["custom_permissions"] = profile.custom_permissions if profile else []

    memberships = (
        CompanyMembership.objects.filter(user=user)
        .exclude(status=MembershipStatus.REMOVED)
        .select_related("company")
        .order_by("company__display_name")
    )
    payload["memberships"] = [
        {
            "company_id": str(m.company_id),
            "company_display_name": m.company.display_name,
            "company_slug": m.company.slug,
            "status": m.status,
        }
        for m in memberships
    ]

    return payload


def update_platform_operator(*, actor: User, user_id, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    target_user = User.objects.filter(pk=user_id).first()
    if target_user is None:
        raise not_found("Operator not found.")

    is_target_sa = is_super_admin(target_user)
    if is_target_sa and actor.id != target_user.id:
        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.security.super_admin_modification_blocked",
            object_type="user",
            object_id=target_user.id,
            after={"attempted_payload": payload},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )
        raise conflict(
            "Other operators cannot modify the Super Admin account.",
            [{"field": "user", "code": "super_admin_protected", "message": "Other operators cannot modify Super Admin."}],
        )

    before_profile = {
        "first_name": target_user.first_name,
        "last_name": target_user.last_name,
        "role_id": str(target_user.platform_profile.role_id) if hasattr(target_user, "platform_profile") and target_user.platform_profile.role_id else None,
    }

    user_updates = []
    if "first_name" in payload:
        first_name = payload.get("first_name", "") or ""
        target_user.first_name = str(first_name).strip()[:150]
        user_updates.append("first_name")

    if "last_name" in payload:
        last_name = payload.get("last_name", "") or ""
        target_user.last_name = str(last_name).strip()[:150]
        user_updates.append("last_name")

    role_changed = False
    new_role = None
    if "role_id" in payload:
        if is_target_sa:
            raise conflict(
                "Cannot change the Super Admin's role. Use ownership transfer to change Super Admin.",
                [{"field": "role_id", "code": "super_admin_protected", "message": "Cannot change Super Admin role."}],
            )
        ensure_super_admin_actor(actor, "change operator platform roles")
        role_id = payload.get("role_id")
        if role_id:
            new_role = PlatformRole.objects.filter(pk=role_id).first()
            if new_role is None:
                raise not_found("Selected role not found.")
        role_changed = True

    with transaction.atomic():
        if user_updates:
            user_updates.append("updated_at")
            target_user.save(update_fields=user_updates)

        profile = get_operator_profile(target_user)
        if profile is None:
            profile, _ = PlatformOperatorProfile.objects.get_or_create(user=target_user)

        if role_changed:
            profile.role = new_role
            profile.session_version += 1
            profile.save(update_fields=["role", "session_version", "updated_at"])

            AuditLog.objects.create(
                company=None,
                actor=actor,
                scope=AuditScope.PLATFORM,
                action="platform.operator.role_changed",
                object_type="user",
                object_id=target_user.id,
                before={"role_id": before_profile["role_id"]},
                after={"role_id": str(new_role.id) if new_role else None, "role_name": new_role.name if new_role else None},
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )

        if "custom_permissions" in payload:
            ensure_super_admin_actor(actor, "edit custom permissions")
            custom_perms = normalize_permission_codes(payload.get("custom_permissions"))
            profile.custom_permissions = custom_perms
            profile.session_version += 1
            profile.save(update_fields=["custom_permissions", "session_version", "updated_at"])

    return get_platform_operator_detail(user_id=target_user.id)


def suspend_platform_operator(*, actor: User, user_id, payload: dict, request) -> dict:
    ensure_super_admin_actor(actor, "suspend platform operators")

    target_user = User.objects.filter(pk=user_id).first()
    if target_user is None:
        raise not_found("Operator not found.")

    if is_super_admin(target_user):
        ensure_not_super_admin_target(target_user, "suspended")

    if target_user.id == actor.id:
        raise conflict("You cannot suspend your own account.", [{"field": "user", "code": "self", "message": "Cannot suspend own account."}])

    reason = str(payload.get("reason", "") or "").strip()
    if not reason:
        raise validation_error([{"field": "reason", "code": "required", "message": "A reason for suspension is required."}])

    with transaction.atomic():
        profile = get_operator_profile(target_user)
        if profile is None:
            profile, _ = PlatformOperatorProfile.objects.get_or_create(user=target_user)

        profile.status = OperatorStatus.SUSPENDED
        profile.status_reason = reason
        profile.save(update_fields=["status", "status_reason", "updated_at"])

        invalidate_user_sessions(target_user)

        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.operator.suspended",
            object_type="user",
            object_id=target_user.id,
            after={"email": target_user.email, "status": "suspended", "reason": reason},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_platform_operator_detail(user_id=target_user.id)


def reactivate_platform_operator(*, actor: User, user_id, payload: dict, request) -> dict:
    ensure_super_admin_actor(actor, "reactivate platform operators")

    target_user = User.objects.filter(pk=user_id).first()
    if target_user is None:
        raise not_found("Operator not found.")

    reason = str(payload.get("reason", "") or "").strip()

    with transaction.atomic():
        target_user.is_active = True
        target_user.save(update_fields=["is_active", "updated_at"])

        profile = get_operator_profile(target_user)
        if profile is None:
            profile, _ = PlatformOperatorProfile.objects.get_or_create(user=target_user)

        profile.status = OperatorStatus.ACTIVE
        profile.status_reason = reason
        profile.save(update_fields=["status", "status_reason", "updated_at"])

        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.operator.reactivated",
            object_type="user",
            object_id=target_user.id,
            after={"email": target_user.email, "status": "active", "reason": reason},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_platform_operator_detail(user_id=target_user.id)


def deactivate_platform_operator(*, actor: User, user_id, payload: dict, request) -> dict:
    ensure_super_admin_actor(actor, "deactivate platform operators")

    target_user = User.objects.filter(pk=user_id).first()
    if target_user is None:
        raise not_found("Operator not found.")

    if is_super_admin(target_user):
        ensure_not_super_admin_target(target_user, "deactivated")

    if target_user.id == actor.id:
        raise conflict("You cannot deactivate your own account.", [{"field": "user", "code": "self", "message": "Cannot deactivate own account."}])

    reason = str(payload.get("reason", "") or "").strip()
    if not reason:
        raise validation_error([{"field": "reason", "code": "required", "message": "A reason for deactivation is required."}])

    with transaction.atomic():
        target_user.is_active = False
        target_user.save(update_fields=["is_active", "updated_at"])

        profile = get_operator_profile(target_user)
        if profile is None:
            profile, _ = PlatformOperatorProfile.objects.get_or_create(user=target_user)

        profile.status = OperatorStatus.DEACTIVATED
        profile.status_reason = reason
        profile.save(update_fields=["status", "status_reason", "updated_at"])

        invalidate_user_sessions(target_user)

        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.operator.deactivated",
            object_type="user",
            object_id=target_user.id,
            after={"email": target_user.email, "status": "deactivated", "reason": reason},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return get_platform_operator_detail(user_id=target_user.id)


def revoke_operator_sessions(*, actor: User, user_id, request) -> dict:
    target_user = User.objects.filter(pk=user_id).first()
    if target_user is None:
        raise not_found("Operator not found.")

    if is_super_admin(target_user) and actor.id != target_user.id:
        ensure_not_super_admin_target(target_user, "have active sessions revoked by another operator")

    with transaction.atomic():
        invalidate_user_sessions(target_user)

        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.operator.sessions_revoked",
            object_type="user",
            object_id=target_user.id,
            after={"email": target_user.email},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )

    return {"revoked": True, "email": target_user.email}


def get_operator_activity_history(*, user_id, query_params: dict) -> dict:
    target_user = User.objects.filter(pk=user_id).first()
    if target_user is None:
        raise not_found("Operator not found.")

    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)

    queryset = AuditLog.objects.filter(
        Q(actor_id=target_user.id) | Q(object_id=target_user.id)
    ).select_related("actor", "company").order_by("-created_at", "id")

    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(row.id),
            "action": row.action,
            "object_type": row.object_type,
            "object_id": str(row.object_id) if row.object_id else None,
            "actor_email": row.actor.email if row.actor else "System",
            "actor_name": f"{row.actor.first_name} {row.actor.last_name}".strip() if row.actor else "System",
            "created_at": _iso(row.created_at),
            "before": row.before,
            "after": row.after,
        }
        for row in page["results"]
    ]
    return page

