from rest_framework.permissions import BasePermission

from .models import UserRole


class IsAdminRole(BasePermission):
    message = "Admin role is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "role", None) == UserRole.ADMIN)
