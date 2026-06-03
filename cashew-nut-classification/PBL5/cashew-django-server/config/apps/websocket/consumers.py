from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer


class ConveyorConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        token = (qs.get("token") or [None])[0]
        if not await self._authenticate(token):
            await self.close(code=4001)
            return

        self.group_name = "conveyor_updates"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def _authenticate(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            from apps.accounts.tokens import verify_access_token
            verify_access_token(token)
            return True
        except Exception:
            return False

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        await self.send_json({"type": "ack", "data": {"received": True}})

    async def conveyor_message(self, event):
        await self.send_json(event["payload"])
