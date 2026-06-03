from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AlertViewSet, ClassifyResultViewSet, ConveyorOverviewView, ConveyorSessionViewSet

router = DefaultRouter()
router.register("sessions", ConveyorSessionViewSet, basename="conveyor-session")
router.register("results", ClassifyResultViewSet, basename="classify-result")
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = [
    path("overview/", ConveyorOverviewView.as_view(), name="conveyor-overview"),
    path("", include(router.urls)),
]
