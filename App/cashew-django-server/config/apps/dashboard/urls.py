from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminUserViewSet, DashboardStatsView

router = DefaultRouter()
router.register("users", AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("", include(router.urls)),
]
