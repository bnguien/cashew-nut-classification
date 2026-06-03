from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


WS_GROUP_CONVEYOR = "conveyor_updates"


def broadcast_conveyor(payload: dict) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        WS_GROUP_CONVEYOR,
        {
            "type": "conveyor_message",
            "payload": payload,
        },
    )
