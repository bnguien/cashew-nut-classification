"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.urls import include, path

from apps.conveyor.esp_capture_views import EspCaptureView


def health_check(request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("api/health/", health_check, name="api-health"),
    path("api/esp/capture/", EspCaptureView.as_view(), name="esp-capture"),
    # Compatibility route for ESP sketches using /upload
    path("upload", EspCaptureView.as_view(), name="esp-capture-upload-no-slash"),
    path("upload/", EspCaptureView.as_view(), name="esp-capture-upload"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/conveyor/", include("apps.conveyor.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/alerts/", include("apps.conveyor.alert_urls")),
    path("api/webtest/", include("apps.webtest.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
