from django.urls import re_path

from .consumers import ConveyorConsumer

websocket_urlpatterns = [
    re_path(r"ws/conveyor/$", ConveyorConsumer.as_asgi()),
]
