from django.urls import path

from .views import (
    WebTestAiUploadView,
    WebTestEspDecisionView,
    WebTestMqttPresetsView,
    WebTestMqttPublishView,
    WebTestServoPanelView,
    WebTestServoPressView,
    WebTestStatusView,
    WebTestWsBroadcastView,
)

urlpatterns = [
    path("status/", WebTestStatusView.as_view(), name="webtest-status"),
    path("ws/broadcast/", WebTestWsBroadcastView.as_view(), name="webtest-ws-broadcast"),
    path("mqtt/publish/", WebTestMqttPublishView.as_view(), name="webtest-mqtt-publish"),
    path("mqtt/presets/", WebTestMqttPresetsView.as_view(), name="webtest-mqtt-presets"),
    path("esp/decision/", WebTestEspDecisionView.as_view(), name="webtest-esp-decision"),
    path("ai/upload/", WebTestAiUploadView.as_view(), name="webtest-ai-upload"),
    path("servo/press/", WebTestServoPressView.as_view(), name="webtest-servo-press"),
    path("servo/panel/", WebTestServoPanelView.as_view(), name="webtest-servo-panel"),
]
