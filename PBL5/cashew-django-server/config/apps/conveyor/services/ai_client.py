import os

import requests
from django.conf import settings

# Timeouts: (connect, read). Read is longer because model first inference can be slow.
_DEFAULT_CONNECT_TIMEOUT = 5.0
_DEFAULT_READ_TIMEOUT = 60.0

_session = requests.Session()


def _ai_server_url() -> str:
    """Read dynamically so changes to .env + server restart are always picked up."""
    url = getattr(settings, "AI_SERVER_URL", None) or os.getenv("AI_SERVER_URL", "http://localhost:8000")
    return url.rstrip("/")


def _ai_timeout() -> tuple[float, float]:
    return (
        float(os.getenv("AI_HTTP_CONNECT_TIMEOUT", str(_DEFAULT_CONNECT_TIMEOUT))),
        float(os.getenv("AI_HTTP_READ_TIMEOUT", str(_DEFAULT_READ_TIMEOUT))),
    )


def classify_image_bytes(image_bytes: bytes, *, return_annotation: bool = False) -> dict:
    """Send JPEG bytes to AI server and return parsed JSON result."""
    annotate = "1" if return_annotation else "0"
    url = f"{_ai_server_url()}/api/predict/?annotate={annotate}"
    files = {"image": ("predict.jpg", image_bytes, "image/jpeg")}
    response = _session.post(url, files=files, timeout=_ai_timeout())
    response.raise_for_status()
    return response.json()


def classify_image(image_file_path: str, *, return_annotation: bool = True) -> dict:
    with open(image_file_path, "rb") as f:
        return classify_image_bytes(f.read(), return_annotation=return_annotation)
