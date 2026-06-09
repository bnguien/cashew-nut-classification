from __future__ import annotations

import base64
import io
import os
import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from PIL import Image, ImageOps
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.conveyor.models import ClassifyResult, ConveyorSession, SessionStatus
from apps.conveyor.services.approval_flow import get_request, resolve_request
from apps.conveyor.services.ai_client import classify_image_bytes
from apps.conveyor.services.image_processing import process_image_for_ai
from apps.conveyor.services.esp32_ctrl import send_command, send_servo_angle
from apps.conveyor.services.mqtt_service import publish
from apps.conveyor.services.mqtt_topics import (
    TOPIC_CONVEYOR_COMMAND,
    TOPIC_CONVEYOR_HEARTBEAT,
    TOPIC_CONVEYOR_SERVO,
    TOPIC_CONVEYOR_STATUS,
)
from apps.websocket.events import broadcast_conveyor

from .permissions import WebTestEnabled


@method_decorator(csrf_exempt, name="dispatch")
class WebTestStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        enabled = os.getenv("WEBTEST_ENABLED", "false").lower() == "true"
        return Response(
            {
                "webtest_enabled": enabled,
                "requires_key": bool(os.getenv("WEBTEST_SECRET", "").strip()),
                "esp_ports": {
                    "receive": [TOPIC_CONVEYOR_COMMAND, TOPIC_CONVEYOR_SERVO],
                    "send": [TOPIC_CONVEYOR_HEARTBEAT, TOPIC_CONVEYOR_STATUS],
                },
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class WebTestWsBroadcastView(APIView):
    permission_classes = [WebTestEnabled]

    def post(self, request):
        payload_type = request.data.get("type")
        data = request.data.get("data")
        if not payload_type or data is None:
            return Response({"detail": "Required fields: type, data"}, status=status.HTTP_400_BAD_REQUEST)
        broadcast_conveyor({"type": payload_type, "data": data})
        return Response({"ok": True, "sent": {"type": payload_type}})


@method_decorator(csrf_exempt, name="dispatch")
class WebTestMqttPublishView(APIView):
    permission_classes = [WebTestEnabled]

    def post(self, request):
        topic = request.data.get("topic")
        payload = request.data.get("payload")
        qos = int(request.data.get("qos", 1))
        if not topic or not isinstance(payload, dict):
            return Response({"detail": "Required: topic (string), payload (object)"}, status=status.HTTP_400_BAD_REQUEST)
        ok = publish(topic, payload, qos=qos)
        return Response({"ok": ok, "topic": topic})


@method_decorator(csrf_exempt, name="dispatch")
class WebTestMqttPresetsView(APIView):
    permission_classes = [WebTestEnabled]

    def post(self, request):
        action = request.data.get("action")
        session_id = request.data.get("session_id")

        if action == "heartbeat":
            ok = publish(TOPIC_CONVEYOR_HEARTBEAT, {"source": "webtest", "alive": True}, qos=0)
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_HEARTBEAT})

        if action == "status_fault":
            body = {
                "severity": "warning",
                "is_fault": True,
                "message": request.data.get("message", "ESP status fault (web simulator)"),
                "source": "webtest",
            }
            if session_id is not None:
                body["session_id"] = session_id
            ok = publish(TOPIC_CONVEYOR_STATUS, body, qos=0)
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_STATUS})

        if action == "command_start":
            ok = publish(
                TOPIC_CONVEYOR_COMMAND,
                {"command": "start", "session_id": session_id, "source": "webtest"},
                qos=1,
            )
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_COMMAND})

        if action == "command_stop":
            ok = publish(
                TOPIC_CONVEYOR_COMMAND,
                {"command": "stop", "session_id": session_id, "source": "webtest"},
                qos=1,
            )
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_COMMAND})

        if action == "mobile_start":
            body = {"command": "start", "session_id": session_id, "source": "mobile_app_test"}
            ok = publish(TOPIC_CONVEYOR_COMMAND, body, qos=1)
            if ok:
                broadcast_conveyor(
                    {
                        "type": "mobile_control_trigger",
                        "data": {
                            "command": "start",
                            "session_id": session_id,
                            "source": "webtest_trigger",
                            "timestamp": timezone.now().isoformat(),
                        },
                    }
                )
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_COMMAND, "payload": body})

        if action == "mobile_stop":
            body = {"command": "stop", "session_id": session_id, "source": "mobile_app_test"}
            ok = publish(TOPIC_CONVEYOR_COMMAND, body, qos=1)
            if ok:
                broadcast_conveyor(
                    {
                        "type": "mobile_control_trigger",
                        "data": {
                            "command": "stop",
                            "session_id": session_id,
                            "source": "webtest_trigger",
                            "timestamp": timezone.now().isoformat(),
                        },
                    }
                )
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_COMMAND, "payload": body})

        if action == "servo_sample":
            ok = publish(
                TOPIC_CONVEYOR_SERVO,
                {"grade": "whole", "angle": 0, "session_id": session_id, "source": "webtest"},
                qos=1,
            )
            return Response({"ok": ok, "topic": TOPIC_CONVEYOR_SERVO})

        return Response(
            {
                "detail": "Unknown action. Use: heartbeat, status_fault, command_start, command_stop, mobile_start, mobile_stop, servo_sample",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


@method_decorator(csrf_exempt, name="dispatch")
class WebTestEspDecisionView(APIView):
    permission_classes = [WebTestEnabled]

    def post(self, request):
        request_id = str(request.data.get("request_id", "")).strip()
        accept = bool(request.data.get("accept", False))
        pending = get_request(request_id)
        if not pending:
            return Response({"detail": "Request not found or already resolved."}, status=status.HTTP_404_NOT_FOUND)

        action = pending["action"]
        session_id = int(pending["session_id"])

        if accept:
            if action == "start":
                session = ConveyorSession.objects.filter(id=session_id, is_deleted=False).first()
                if session:
                    session.status = SessionStatus.RUNNING
                    session.updated_at = timezone.now()
                    session.save(update_fields=["status", "updated_at"])
                send_command("start", session_id=session_id)
            elif action == "stop":
                session = ConveyorSession.objects.filter(id=session_id, is_deleted=False).first()
                if session:
                    session.status = SessionStatus.COMPLETED
                    session.ended_at = timezone.now()
                    session.updated_at = timezone.now()
                    session.save(update_fields=["status", "ended_at", "updated_at"])
                send_command("stop", session_id=session_id)

        resolve_request(request_id)
        broadcast_conveyor(
            {
                "type": "esp_control_decision",
                "data": {
                    "request_id": request_id,
                    "action": action,
                    "session_id": session_id,
                    "accepted": accept,
                },
            }
        )
        return Response({"ok": True, "accepted": accept, "action": action, "session_id": session_id})


@method_decorator(csrf_exempt, name="dispatch")
class WebTestServoPressView(APIView):
    permission_classes = [WebTestEnabled]

    def post(self, request):
        grade = str(request.data.get("grade", "")).strip().lower()
        grade_map = {
            "whole": 0,
            "broken": 90,
            "defect": 180,
        }
        if grade not in grade_map:
            return Response({"detail": "grade must be one of: whole, broken, defect"}, status=status.HTTP_400_BAD_REQUEST)

        session_id = request.data.get("session_id")
        try:
            session_id_int = int(session_id) if session_id is not None else None
        except Exception:
            session_id_int = None

        result = send_servo_angle(angle=grade_map[grade], grade=grade, session_id=session_id_int)
        return Response({"ok": result.get("ok", False), "topic": result.get("topic"), "grade": grade, "angle": grade_map[grade]})


@method_decorator(csrf_exempt, name="dispatch")
class WebTestAiUploadView(APIView):
    permission_classes = [WebTestEnabled]

    def _pick_session(self) -> ConveyorSession | None:
        running = ConveyorSession.objects.filter(status=SessionStatus.RUNNING, is_deleted=False).order_by("-started_at").first()
        if running:
            return running
        return ConveyorSession.objects.filter(is_deleted=False).order_by("-started_at").first()

    def _preprocess_for_ai(self, uploaded_file) -> bytes:
        target = int(getattr(settings, "CASHEW_IMAGE_PREPROCESS_SIZE", 240))
        quality = int(getattr(settings, "CASHEW_IMAGE_JPEG_QUALITY", 85))
        return process_image_for_ai(uploaded_file, target_size=target, quality=quality)

    def post(self, request):
        image = request.FILES.get("image")
        if image is None:
            return Response({"ok": False, "detail": "Required multipart field: image"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            processed_bytes = self._preprocess_for_ai(image)
        except Exception as exc:
            return Response({"ok": False, "detail": f"Invalid image file: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ai_result = classify_image_bytes(processed_bytes, return_annotation=True)
        except Exception as exc:
            return Response({"ok": False, "detail": f"AI server request failed: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)

        media_root = Path(settings.MEDIA_ROOT)
        (media_root / "cashew_images_raw").mkdir(parents=True, exist_ok=True)
        (media_root / "cashew_images").mkdir(parents=True, exist_ok=True)
        (media_root / "cashew_images_labeled").mkdir(parents=True, exist_ok=True)

        day_folder = timezone.now().strftime('%Y%m%d')
        file_stamp = uuid.uuid4().hex

        image.seek(0)
        raw_rel = f"cashew_images_raw/{day_folder}/{file_stamp}.jpg"
        default_storage.save(raw_rel, image)

        save_rel = f"cashew_images/{day_folder}/{file_stamp}.jpg"
        stored_path = default_storage.save(save_rel, ContentFile(processed_bytes))

        if not ai_result.get("ok"):
            return Response({"ok": False, "detail": "AI server returned non-ok response", "ai_response": ai_result}, status=status.HTTP_502_BAD_GATEWAY)

        labeled_path = None
        labeled_b64 = ai_result.get("annotated_image_base64")
        if labeled_b64:
            try:
                labeled_bytes = base64.b64decode(labeled_b64, validate=True)
                labeled_rel = f"cashew_images_labeled/{timezone.now().strftime('%Y%m%d')}/{uuid.uuid4().hex}.jpg"
                labeled_path = default_storage.save(labeled_rel, ContentFile(labeled_bytes))
            except Exception as exc:
                labeled_path = None
                ai_result["warning"] = f"{ai_result.get('warning', '')} Labeled image decode failed: {exc}".strip()
        else:
            ai_result["warning"] = f"{ai_result.get('warning', '')} AI response missing annotated_image_base64.".strip()

        session = self._pick_session()
        classify_row = None
        if session is not None:
            grade = str(ai_result.get("grade", "unknown")).strip().lower()
            confidence = float(ai_result.get("confidence", 0))
            classify_row = ClassifyResult.objects.create(
                session=session,
                image_path=stored_path,
                grade=grade,
                confidence=confidence,
            )

            session.total_count += 1
            if grade == "whole":
                session.whole_count += 1
            elif grade == "broken":
                session.broken_count += 1
            elif grade == "defect":
                session.defect_count += 1
            session.updated_at = timezone.now()
            session.save(update_fields=["total_count", "whole_count", "broken_count", "defect_count", "updated_at"])

        payload = {
            "id": classify_row.id if classify_row else None,
            "session_id": classify_row.session_id if classify_row else None,
            "raw_image_url": request.build_absolute_uri(f"/media/{raw_rel}"),
            "image_path": stored_path,
            "image_url": request.build_absolute_uri(f"/media/{stored_path}"),
            "labeled_image_path": labeled_path,
            "labeled_image_url": request.build_absolute_uri(f"/media/{labeled_path}") if labeled_path else None,
            "grade": ai_result.get("grade"),
            "confidence": ai_result.get("confidence"),
            "model_version": ai_result.get("model_version"),
            "inference_ms": ai_result.get("inference_ms"),
            "mock_mode": ai_result.get("mock_mode"),
            "warning": ai_result.get("warning"),
            "created_at": timezone.now().isoformat(),
        }
        broadcast_conveyor({"type": "classify_result", "data": payload})
        return Response({"ok": True, "saved": bool(classify_row), "result": payload})


@method_decorator(csrf_exempt, name="dispatch")
class WebTestServoPanelView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        html = """
<!doctype html>
<html lang=\"vi\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Cashew AI Test Panel</title>
  <style>
    :root {
      --bg: #0b1220;
      --card: #111a2e;
      --muted: #95a4c2;
      --text: #f5f7ff;
      --accent: #7c9cff;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Segoe UI, Roboto, sans-serif;
      background: radial-gradient(circle at top, #13203a 0%, var(--bg) 45%);
      color: var(--text);
      min-height: 100vh;
      padding: 24px;
    }
    .grid {
      max-width: 1080px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .card {
      background: linear-gradient(160deg, rgba(255,255,255,.04), rgba(255,255,255,.01));
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 12px 30px rgba(0,0,0,.25);
    }
    .full { grid-column: 1 / -1; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    p { margin: 0 0 14px; color: var(--muted); }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      color: #fff;
      background: #273a63;
      cursor: pointer;
      font-weight: 600;
    }
    button.primary { background: var(--accent); color: #0a1330; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    input[type=file] {
      background: #0d1528;
      border: 1px solid rgba(255,255,255,.12);
      color: var(--text);
      border-radius: 10px;
      padding: 10px;
      width: 100%;
    }
    .pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      background: rgba(124,156,255,.18);
      color: #b9c9ff;
    }
    .preview {
      width: 100%;
      max-height: 300px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.08);
      background: #0b1324;
    }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .stat {
      background: #0d1528;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px;
      padding: 10px;
    }
    .stat b { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); font-weight: 500; }
    .stat span { font-size: 20px; font-weight: 700; }
    pre {
      margin: 0;
      background: #07101f;
      color: #d5dff7;
      border-radius: 12px;
      padding: 12px;
      min-height: 120px;
      max-height: 300px;
      overflow: auto;
      border: 1px solid rgba(255,255,255,.08);
      font-size: 12px;
    }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class=\"grid\">
    <div class=\"card full\">
      <h1>Cashew AI Realtime Panel</h1>
      <p>Web test dong vai ESP32: upload anh -> Django luu media -> goi AI server -> nhan ket qua phan loai realtime.</p>
      <div class=\"row\">
        <span class=\"pill\" id=\"wsState\">WS: connecting...</span>
        <span class=\"pill\" id=\"apiState\">API: ready</span>
      </div>
    </div>

    <div class=\"card\">
      <h2>Upload anh phan loai</h2>
      <input id=\"imageInput\" type=\"file\" accept=\"image/*\" />
      <div style=\"height: 10px\"></div>
      <div class=\"row\">
        <button class=\"primary\" id=\"uploadBtn\" onclick=\"uploadImage()\">Upload & Predict</button>
      </div>
      <div style=\"height: 14px\"></div>
      <img id=\"preview\" class=\"preview\" alt=\"preview\" />
    </div>

    <div class=\"card\">
      <h2>Ket qua moi nhat</h2>
      <div class=\"stats\">
        <div class=\"stat\"><b>GRADE</b><span id=\"grade\">-</span></div>
        <div class=\"stat\"><b>CONFIDENCE</b><span id=\"confidence\">-</span></div>
        <div class=\"stat\"><b>LATENCY</b><span id=\"latency\">-</span></div>
      </div>
      <div style=\"height: 12px\"></div>
      <pre id=\"resultJson\">No result yet.</pre>
    </div>

    <div class=\"card full\">
      <h2>Realtime logs</h2>
      <pre id=\"logs\">Waiting events...</pre>
    </div>
  </div>
  <script>
    const imageInput = document.getElementById('imageInput');
    const preview = document.getElementById('preview');
    const resultJson = document.getElementById('resultJson');
    const logs = document.getElementById('logs');
    const wsState = document.getElementById('wsState');
    const apiState = document.getElementById('apiState');
    const gradeEl = document.getElementById('grade');
    const confidenceEl = document.getElementById('confidence');
    const latencyEl = document.getElementById('latency');
    const uploadBtn = document.getElementById('uploadBtn');

    function pushLog(line) {
      const now = new Date().toLocaleTimeString('vi-VN');
      logs.textContent = `[${now}] ${line}\\n` + logs.textContent;
    }

    imageInput.addEventListener('change', () => {
      const f = imageInput.files?.[0];
      if (!f) return;
      preview.src = URL.createObjectURL(f);
      pushLog(`Selected image: ${f.name} (${Math.round(f.size / 1024)} KB)`);
    });

    function paintResult(data) {
      gradeEl.textContent = String(data.grade || '-').toUpperCase();
      confidenceEl.textContent = typeof data.confidence === 'number'
        ? `${(data.confidence * 100).toFixed(2)}%`
        : '-';
      latencyEl.textContent = data.inference_ms ? `${data.inference_ms} ms` : '-';
      resultJson.textContent = JSON.stringify(data, null, 2);
      if (data.labeled_image_url || data.image_url) {
        preview.src = data.labeled_image_url || data.image_url;
      }
    }

    async function uploadImage() {
      const file = imageInput.files?.[0];
      if (!file) {
        alert('Hay chon anh truoc khi upload.');
        return;
      }

      uploadBtn.disabled = true;
      apiState.textContent = 'API: uploading...';
      try {
        const fd = new FormData();
        fd.append('image', file);
        const res = await fetch('/api/webtest/ai/upload/', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.detail || JSON.stringify(data));
        }
        paintResult(data.result);
        apiState.textContent = 'API: success';
        pushLog(`Predict success: ${data.result.grade} (${data.result.confidence})`);
      } catch (err) {
        apiState.textContent = 'API: failed';
        pushLog(`Predict error: ${err.message}`);
        alert(`Upload that bai: ${err.message}`);
      } finally {
        uploadBtn.disabled = false;
      }
    }

    const base = window.location.origin;
    const wsBase = base.startsWith('https://') ? base.replace('https://', 'wss://') : base.replace('http://', 'ws://');
    const ws = new WebSocket(`${wsBase}/ws/conveyor/`);
    ws.onopen = () => {
      wsState.textContent = 'WS: connected';
      pushLog('WebSocket connected.');
    };
    ws.onclose = () => {
      wsState.textContent = 'WS: disconnected';
      pushLog('WebSocket disconnected.');
    };
    ws.onerror = () => pushLog('WebSocket error.');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'classify_result') {
          paintResult(msg.data);
          pushLog(`Realtime classify_result: ${msg.data.grade} (${msg.data.confidence})`);
          return;
        }
        if (msg.type === 'esp_status') {
          pushLog(`ESP status: ${JSON.stringify(msg.data)}`);
        }
      } catch (e) {
        pushLog('Received malformed realtime payload.');
      }
    }

    window.uploadImage = uploadImage;
  </script>
</body>
</html>
        """
        return HttpResponse(html)
