
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string


def send_password_reset_email(user, raw_token):
    reset_url = (
        f"{settings.FRONTEND_URL}/reset-password"
        f"?token={raw_token}"
    )

    context = {
        "first_name": user.first_name or "there",
        "reset_url": reset_url,
    }

    subject = "Reset your Pulse password"

    text_content = f"""
Hello {context["first_name"]},

We received a request to reset your Pulse password.

Use the link below to choose a new password:

{reset_url}

This link expires in 60 minutes.

If you did not request this change, you can ignore this email.
Your existing password will remain unchanged.

Regards,
Pulse Team
"""

    html_content = render_to_string(
        "emails/password_reset.html",
        context,
    )

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )

    email.attach_alternative(html_content, "text/html")

    return email.send(fail_silently=False)
