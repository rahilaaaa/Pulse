from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api.exceptions import PulseAPIException


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception as exc:
            raise PulseAPIException(
                code="server_error",
                message="The database is unavailable.",
                status_code=503,
            ) from exc
        return Response({"status": "ok"})
