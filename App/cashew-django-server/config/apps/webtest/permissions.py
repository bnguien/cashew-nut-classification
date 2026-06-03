import os

from rest_framework.permissions import BasePermission


class WebTestEnabled(BasePermission):
    """
    Chỉ cho phép khi WEBTEST_ENABLED=true và (tuỳ chọn) header X-WebTest-Key khớp WEBTEST_SECRET.
    """

    message = "Web test API is disabled. Set WEBTEST_ENABLED=true in .env (dev only)."

    def has_permission(self, request, view):
        if os.getenv("WEBTEST_ENABLED", "false").lower() != "true":
            return False
        secret = os.getenv("WEBTEST_SECRET", "").strip()
        if not secret:
            return True
        return request.headers.get("X-WebTest-Key") == secret
