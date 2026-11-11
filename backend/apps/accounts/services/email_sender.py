from django.conf import settings
from django.core.mail import send_mail


def send_verification_email(user, raw_token):
    verification_url = (
        f"{settings.FRONTEND_URL}/verify-email"
        f"?token={raw_token}"
    )

    subject = "Verify your Pulse account"

    message = f"""
Hello {user.first_name},

Thank you for registering with Pulse.

Please verify your email address using the link below:

{verification_url}

This link expires in 24 hours.

If you did not request this registration, you can ignore this email.

Regards,
Pulse Team
"""

    return send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )