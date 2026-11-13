from django.urls import path

from apps.invitations.views import (
    CompanyInvitationListCreateView,
    AcceptInvitationView,
    RevokeInvitationView,
    ResendInvitationView,
)


app_name = "invitations"


urlpatterns = [
    path(
        "",
        CompanyInvitationListCreateView.as_view(),
        name="company-invitations",
    ),
    path(
        "accept/",
        AcceptInvitationView.as_view(),
        name="accept-invitation",
    ),
    path(
        "<uuid:invitation_id>/resend/",
        ResendInvitationView.as_view(),
        name="resend-invitation",
    ),
    path(
        "<uuid:invitation_id>/revoke/",
        RevokeInvitationView.as_view(),
        name="revoke-invitation",
    ),
]
