from django.urls import path

from .views import HealthAPIView, PredictAPIView

urlpatterns = [
    path("health/", HealthAPIView.as_view(), name="ai-health"),
    path("predict/", PredictAPIView.as_view(), name="ai-predict"),
]
