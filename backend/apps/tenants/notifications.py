from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import require_permission
from apps.tenants.models import Announcement, CompanyNotification, MembershipStatus, NotificationCategory, NotificationPreference
from apps.tenants.services import _ip, _request_id
from common.api.errors import validation_error

PREFERENCE_EVENTS = (
    ("Work", "task_assigned", "Task assigned to me", True, True),
    ("Work", "task_due", "Task due tomorrow", True, True),
    ("Work", "comment_mention", "Comment mentions me", True, False),
    ("People", "invitation_accepted", "Invitation accepted", True, True),
    ("People", "person_offboarded", "Person offboarded", True, True),
    ("Billing", "invoice_available", "Invoice available", True, True),
    ("Billing", "payment_failed", "Payment failed", True, True),
)
_EVENTS = {item[1]: item for item in PREFERENCE_EVENTS}


def _invalid(field, message):
    raise validation_error([{"field": field, "code": "invalid", "message": message}], message=message)


def _name(user) -> str:
    if user is None:
        return "Pulse"
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.email


def _notice(row: CompanyNotification) -> dict:
    return {
        "id": str(row.id),
        "category": row.category,
        "title": row.title,
        "body": row.body,
        "read": row.read_at is not None,
        "created_at": row.created_at.isoformat(),
    }


def _announcement(row: Announcement) -> dict:
    return {
        "id": str(row.id),
        "title": row.title,
        "message": row.message,
        "audience": row.audience,
        "author_name": _name(row.author),
        "created_at": row.created_at.isoformat(),
    }


def ensure_welcome(company, user):
    CompanyNotification.objects.get_or_create(
        company=company,
        recipient=user,
        kind="welcome",
        defaults={
            "category": NotificationCategory.SYSTEM,
            "title": "Welcome to Pulse",
            "body": "Your workspace is ready. Finish setup to invite your team.",
        },
    )


def list_notifications(company, user):
    ensure_welcome(company, user)
    rows = CompanyNotification.objects.filter(company=company, recipient=user)
    results = [_notice(row) for row in rows]
    return {"results": results, "unread_count": sum(1 for row in results if not row["read"])}


def mark_read(company, user, payload):
    queryset = CompanyNotification.objects.filter(company=company, recipient=user, read_at__isnull=True)
    if isinstance(payload, dict) and payload.get("ids"):
        ids = payload.get("ids")
        if not isinstance(ids, list) or not all(isinstance(item, str) for item in ids):
            _invalid("ids", "Choose notifications to mark read.")
        queryset = queryset.filter(pk__in=ids)
    queryset.update(read_at=timezone.now())
    return list_notifications(company, user)


def list_announcements(company):
    return [_announcement(row) for row in Announcement.objects.filter(company=company).select_related("author")]


def publish_announcement(request, company, payload):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    title = payload.get("title")
    message = payload.get("message")
    if not isinstance(title, str) or not title.strip():
        _invalid("title", "Enter a title.")
    if not isinstance(message, str) or not message.strip():
        _invalid("message", "Enter a message.")
    audience = payload.get("audience") or "Everyone"
    if not isinstance(audience, str) or not audience.strip():
        _invalid("audience", "Choose an audience.")
    title = title.strip()[:200]
    message = message.strip()
    audience = audience.strip()[:150]
    with transaction.atomic():
        row = Announcement.objects.create(
            company=company,
            author=request.user,
            title=title,
            message=message,
            audience=audience,
        )
        deliveries = [
            CompanyNotification(
                company=company,
                recipient_id=user_id,
                category=NotificationCategory.SYSTEM,
                kind="announcement",
                title=title,
                body=message,
                announcement=row,
            )
            for user_id in company.memberships.filter(status=MembershipStatus.ACTIVE).values_list("user_id", flat=True)
        ]
        CompanyNotification.objects.bulk_create(deliveries)
        AuditLog.objects.create(
            company=company,
            actor=request.user,
            action="announcement.published",
            object_type="announcement",
            object_id=row.id,
            after=_announcement(row),
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    return row


def list_preferences(company, user):
    saved = {row.event: row for row in NotificationPreference.objects.filter(company=company, user=user)}
    results = []
    for group, event, label, in_app, email_enabled in PREFERENCE_EVENTS:
        row = saved.get(event)
        results.append({
            "group": group,
            "event": event,
            "label": label,
            "in_app": row.in_app if row else in_app,
            "email": row.email_enabled if row else email_enabled,
        })
    return results


def save_preference(company, user, payload):
    if not isinstance(payload, dict):
        _invalid("", "Send a JSON object.")
    event = payload.get("event")
    if event not in _EVENTS:
        _invalid("event", "Choose a notification event.")
    _group, _event, _label, default_in_app, default_email = _EVENTS[event]
    in_app = payload.get("in_app", default_in_app)
    email_enabled = payload.get("email", default_email)
    if not isinstance(in_app, bool) or not isinstance(email_enabled, bool):
        _invalid("event", "Choose on or off.")
    row, _created = NotificationPreference.objects.update_or_create(
        company=company,
        user=user,
        event=event,
        defaults={"in_app": in_app, "email_enabled": email_enabled},
    )
    return {"event": row.event, "in_app": row.in_app, "email": row.email_enabled}


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        return Response(list_notifications(membership.company, request.user))

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        return Response(mark_read(membership.company, request.user, request.data))


class AnnouncementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        return Response({"results": list_announcements(membership.company)})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.update")
        row = publish_announcement(request, membership.company, request.data)
        return Response(_announcement(row), status=201)


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        return Response({"results": list_preferences(membership.company, request.user)})

    def patch(self, request, company_id):
        membership = require_permission(request.user, company_id, "company.view")
        return Response(save_preference(membership.company, request.user, request.data))
