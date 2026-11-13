from rest_framework_simplejwt.tokens import AccessToken


def create_company_access_token(user, membership):
    """
    Generate an access token scoped to an active company membership.
    """
    token = AccessToken.for_user(user)

    token["company_id"] = membership.company_id
    token["membership_id"] = membership.id

    return str(token)