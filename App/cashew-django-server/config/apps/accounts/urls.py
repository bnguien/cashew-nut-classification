from django.urls import path

from .views import LoginView, TokenRefreshView

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
]
