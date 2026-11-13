
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string


def send_verification_email(user, raw_token):
    verification_url = (
        f"{settings.FRONTEND_URL}/verify-email"
        f"?token={raw_token}"
    )

    subject = "Verify your Pulse account"

    context = {
        "first_name": user.first_name or "there",
        "verification_url": verification_url,
    }

    # Plain-text fallback for email clients that do not support HTML.
    text_content = f"""
Hello {context["first_name"]},

Thank you for registering with Pulse.

Please verify your email address using the link below:

{verification_url}

This link expires in 24 hours.

If you did not request this registration, you can ignore this email.

Regards,
Pulse Team
"""

    # Render the HTML email template.
    html_content = render_to_string(
        "emails/verify_email.html",
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
