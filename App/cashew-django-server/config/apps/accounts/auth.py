from rest_framework import authentication, exceptions

from apps.dashboard.models import AppUser

from .tokens import verify_access_token


class AppUserJWTAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("utf-8")
        if not header:
            return None

        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise exceptions.AuthenticationFailed("Invalid authorization header format.")

        token = parts[1]
        try:
            user_id = verify_access_token(token)
            user = AppUser.objects.get(id=user_id, is_active=True)
        except (exceptions.AuthenticationFailed, AppUser.DoesNotExist):
            raise exceptions.AuthenticationFailed("Invalid or expired access token.")

        return user, None
