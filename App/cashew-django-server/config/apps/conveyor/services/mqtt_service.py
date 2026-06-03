import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt

from apps.websocket.events import broadcast_conveyor

from .mqtt_topics import (
    SUBSCRIBE_TOPICS,
    TOPIC_CONVEYOR_COMMAND,
    TOPIC_CONVEYOR_HEARTBEAT,
    TOPIC_CONVEYOR_SERVO,
    TOPIC_CONVEYOR_STATUS,
)

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "30"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "cashew-django-server")
MQTT_HEARTBEAT_TIMEOUT_SEC = int(os.getenv("MQTT_HEARTBEAT_TIMEOUT_SEC", "10"))
MQTT_ENABLED = os.getenv("MQTT_ENABLED", "true").lower() == "true"

_mqtt_client: mqtt.Client | None = None
_started = False
_lock = threading.Lock()
_state: dict[str, Any] = {
    "connected": False,
    "esp_last_heartbeat_ts": 0.0,
    "esp_last_status": {},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_payload(raw_payload: bytes) -> dict[str, Any]:
    if not raw_payload:
        return {}
    try:
        value = json.loads(raw_payload.decode("utf-8"))
        return value if isinstance(value, dict) else {"value": value}
    except Exception:
        return {"raw": raw_payload.decode("utf-8", errors="ignore")}


def _on_connect(client: mqtt.Client, _userdata, _flags, reason_code, _properties=None):
    _state["connected"] = reason_code == 0
    if reason_code == 0:
        for topic, qos in SUBSCRIBE_TOPICS:
            client.subscribe(topic, qos=qos)
        broadcast_conveyor(
            {
                "type": "esp_status",
                "data": {
                    "esp_connected": get_esp_connected(),
                    "broker_connected": True,
                    "source": "mqtt_connect",
                    "timestamp": _now_iso(),
                },
            }
        )


def _on_disconnect(_client: mqtt.Client, _userdata, *args):
    # Support both callback signatures:
    # - v1: (client, userdata, rc)
    # - v2: (client, userdata, disconnect_flags, reason_code, properties)
    if len(args) == 1:
        reason_code = args[0]
    elif len(args) >= 2:
        reason_code = args[1]
    else:
        reason_code = None

    _state["connected"] = False
    broadcast_conveyor(
        {
            "type": "esp_status",
            "data": {
                "esp_connected": get_esp_connected(),
                "broker_connected": False,
                "source": "mqtt_disconnect",
                "reason_code": reason_code,
                "timestamp": _now_iso(),
            },
        }
    )


def _on_message(_client: mqtt.Client, _userdata, msg: mqtt.MQTTMessage):
    payload = _safe_payload(msg.payload)
    if msg.topic in {TOPIC_CONVEYOR_COMMAND, TOPIC_CONVEYOR_SERVO}:
        broadcast_conveyor(
            {
                "type": "esp_port_rx",
                "data": {
                    "topic": msg.topic,
                    "payload": payload,
                    "timestamp": _now_iso(),
                },
            }
        )
        if msg.topic == TOPIC_CONVEYOR_COMMAND:
            command = str(payload.get("command", "")).strip().lower()
            if command in {"start", "stop"}:
                broadcast_conveyor(
                    {
                        "type": "mobile_control_signal",
                        "data": {
                            "command": command,
                            "session_id": payload.get("session_id"),
                            "source": payload.get("source", "mqtt_command"),
                            "timestamp": _now_iso(),
                        },
                    }
                )
        return

    if msg.topic == TOPIC_CONVEYOR_HEARTBEAT:
        _state["esp_last_heartbeat_ts"] = time.time()
        broadcast_conveyor(
            {
                "type": "esp_status",
                "data": {
                    "esp_connected": get_esp_connected(),
                    "is_running": True,
                    "broker_connected": _state["connected"],
                    "heartbeat": payload,
                    "source": "heartbeat",
                    "timestamp": _now_iso(),
                },
            }
        )
        return

    if msg.topic == TOPIC_CONVEYOR_STATUS:
        _state["esp_last_status"] = payload
        data = {
            "esp_connected": get_esp_connected(),
            "broker_connected": _state["connected"],
            "status": payload,
            "source": "status",
            "timestamp": _now_iso(),
        }
        broadcast_conveyor({"type": "esp_status", "data": data})
        severity = str(payload.get("severity", "")).lower()
        is_fault = bool(payload.get("is_fault", False))
        if is_fault or severity in {"warning", "error", "critical"}:
            try:
                from apps.conveyor.models import Alert, ConveyorSession

                session = (
                    ConveyorSession.objects.filter(is_deleted=False)
                    .order_by("-started_at")
                    .first()
                )
                if session:
                    Alert.objects.create(
                        session=session,
                        alert_type=severity or "system_status",
                        message=str(payload.get("message", "ESP status fault")),
                        is_read=False,
                    )
            except Exception:
                # Keep MQTT listener resilient even when DB write fails.
                pass


def start_mqtt_listener() -> None:
    global _mqtt_client, _started
    if not MQTT_ENABLED:
        return
    with _lock:
        if _started:
            return
        client = mqtt.Client(client_id=MQTT_CLIENT_ID, protocol=mqtt.MQTTv311)
        if MQTT_USERNAME:
            client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        client.on_connect = _on_connect
        client.on_disconnect = _on_disconnect
        client.on_message = _on_message
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.connect_async(MQTT_BROKER_HOST, MQTT_BROKER_PORT, MQTT_KEEPALIVE)
        client.loop_start()
        _mqtt_client = client
        _started = True


def publish(topic: str, payload: dict[str, Any], qos: int = 1) -> bool:
    if not MQTT_ENABLED:
        return False
    if _mqtt_client is None:
        return False
    result = _mqtt_client.publish(topic, json.dumps(payload), qos=qos, retain=False)
    ok = result.rc == mqtt.MQTT_ERR_SUCCESS
    if ok:
        broadcast_conveyor(
            {
                "type": "esp_port_tx",
                "data": {
                    "topic": topic,
                    "payload": payload,
                    "qos": qos,
                    "timestamp": _now_iso(),
                },
            }
        )
    return ok


def publish_command(command: str, session_id: int | None = None) -> bool:
    return publish(
        TOPIC_CONVEYOR_COMMAND,
        {
            "command": command,
            "session_id": session_id,
            "timestamp": _now_iso(),
        },
        qos=1,
    )


def publish_servo(grade: str, angle: int, session_id: int | None = None) -> bool:
    return publish(
        TOPIC_CONVEYOR_SERVO,
        {
            "grade": grade,
            "angle": angle,
            "session_id": session_id,
            "timestamp": _now_iso(),
        },
        qos=1,
    )


def get_esp_connected() -> bool:
    last_heartbeat = float(_state.get("esp_last_heartbeat_ts") or 0.0)
    if last_heartbeat <= 0:
        return False
    return (time.time() - last_heartbeat) <= MQTT_HEARTBEAT_TIMEOUT_SEC
