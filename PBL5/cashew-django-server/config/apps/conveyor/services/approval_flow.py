import threading
import uuid
from datetime import datetime, timezone

_lock = threading.Lock()
_pending: dict[str, dict] = {}


def create_request(action: str, session_id: int) -> dict:
    request_id = uuid.uuid4().hex
    payload = {
        "request_id": request_id,
        "action": action,
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with _lock:
        _pending[request_id] = payload
    return payload


def get_request(request_id: str) -> dict | None:
    with _lock:
        return _pending.get(request_id)


def resolve_request(request_id: str) -> dict | None:
    with _lock:
        return _pending.pop(request_id, None)
