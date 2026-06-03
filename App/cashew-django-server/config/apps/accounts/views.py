from django.contrib.auth.hashers import check_password
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.models import AppUser

from .serializers import LoginSerializer, TokenRefreshSerializer
from .tokens import create_access_token, create_refresh_token, verify_refresh_token


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        try:
            user = AppUser.objects.get(username=username, is_active=True)
        except AppUser.DoesNotExist:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        if not check_password(password, user.password):
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(
            {
                "access": create_access_token(user.id),
                "refresh": create_refresh_token(user.id),
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "full_name": user.username,
                    "role": user.role,
                },
            }
        )


class TokenRefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TokenRefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh"]

        try:
            user_id = verify_refresh_token(refresh)
            user = AppUser.objects.get(id=user_id, is_active=True)
        except Exception:
            return Response({"detail": "Invalid or expired refresh token."}, status=status.HTTP_401_UNAUTHORIZED)

        return Response({"access": create_access_token(user.id)})
