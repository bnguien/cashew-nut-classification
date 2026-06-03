from __future__ import annotations

import base64
import io
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from PIL import Image, ImageOps
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.conveyor.models import ClassifyResult, ConveyorSession, SessionStatus
from apps.conveyor.services.ai_client import classify_image_bytes
from apps.conveyor.services.image_processing import process_image_for_ai
from apps.conveyor.services.mqtt_service import publish
from apps.conveyor.services.mqtt_topics import TOPIC_CONVEYOR_SERVO
from apps.websocket.events import broadcast_conveyor


def _esp_api_key_ok(request) -> bool:
    expected = (settings.ESP_API_KEY or "").strip()
    if not expected:
        return True
    return request.headers.get("X-ESP-Key") == expected


def _pick_session(session_id_raw) -> ConveyorSession | None:
    if session_id_raw is not None and str(session_id_raw).strip() != "":
        try:
            sid = int(session_id_raw)
            row = ConveyorSession.objects.filter(id=sid, is_deleted=False).first()
            if row:
                return row
        except (TypeError, ValueError):
            pass
    running = ConveyorSession.objects.filter(status=SessionStatus.RUNNING, is_deleted=False).order_by("-started_at").first()
    if running:
        return running
    return ConveyorSession.objects.filter(is_deleted=False).order_by("-started_at").first()


def _preprocess_for_ai(uploaded_file) -> bytes:
    """
    Detect and crop the cashew from the green conveyor belt background.
    Resizes it to 240x240 for the AI server.
    """
    target = int(getattr(settings, "CASHEW_IMAGE_PREPROCESS_SIZE", 240))
    quality = int(getattr(settings, "CASHEW_IMAGE_JPEG_QUALITY", 85))
    return process_image_for_ai(uploaded_file, target_size=target, quality=quality)


def _grade_to_c(grade: str, confidence: float, min_conf: float) -> tuple[int, float]:
    g = grade.strip().lower()
    if confidence < min_conf:
        return 0, round(confidence, 4)
    if g == "whole":
        return 1, round(confidence, 4)
    if g == "broken":
        return 2, round(confidence, 4)
    if g == "defect":
        return 3, round(confidence, 4)
    return 0, round(confidence, 4)


def _ensure_media_dirs() -> None:
    media_root = Path(settings.MEDIA_ROOT)
    (media_root / "cashew_images_raw").mkdir(parents=True, exist_ok=True)
    (media_root / "cashew_images").mkdir(parents=True, exist_ok=True)
    (media_root / "cashew_images_labeled").mkdir(parents=True, exist_ok=True)


@method_decorator(csrf_exempt, name="dispatch")
class EspCaptureView(APIView):
    """
    ESP32-CAM: POST multipart field `image` (+ optional session_id, device_id).
    Auth: header X-ESP-Key must match settings.ESP_API_KEY when set.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not _esp_api_key_ok(request):
            return Response({"ok": False, "detail": "Invalid or missing X-ESP-Key."}, status=status.HTTP_401_UNAUTHORIZED)

        image = request.FILES.get("image")
        if image is None:
            return Response({"ok": False, "detail": "Required multipart field: image"}, status=status.HTTP_400_BAD_REQUEST)

        session_id_param = request.POST.get("session_id") or request.data.get("session_id")
        device_id = (request.POST.get("device_id") or request.data.get("device_id") or "").strip() or None

        try:
            processed_bytes = _preprocess_for_ai(image)
        except Exception as exc:
            return Response({"ok": False, "detail": f"Invalid image file: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ai_result = classify_image_bytes(
                processed_bytes,
                return_annotation=bool(settings.ESP_AI_RETURN_ANNOTATION),
            )
        except Exception as exc:
            return Response({"ok": False, "detail": f"AI server request failed: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)

        _ensure_media_dirs()
        now = timezone.now()
        day_folder = now.strftime("%Y%m%d")
        file_stamp = now.strftime("%Y%m%d_%H%M%S_%f")
        
        # 1. Lưu ảnh gốc (RAW) từ ESP32
        image.seek(0)
        raw_rel = f"cashew_images_raw/{day_folder}/{file_stamp}.jpg"
        default_storage.save(raw_rel, image)

        # 2. Lưu ảnh tiền xử lý (Cropped 240x240)
        save_rel = f"cashew_images/{day_folder}/{file_stamp}.jpg"
        stored_path = default_storage.save(save_rel, ContentFile(processed_bytes))

        if not ai_result.get("ok"):
            return Response(
                {"ok": False, "detail": "AI server returned non-ok response", "ai_response": ai_result},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        labeled_path = None
        labeled_b64 = ai_result.get("annotated_image_base64")
        if labeled_b64:
            try:
                labeled_bytes = base64.b64decode(labeled_b64, validate=True)
                labeled_rel = f"cashew_images_labeled/{day_folder}/{file_stamp}.jpg"
                labeled_path = default_storage.save(labeled_rel, ContentFile(labeled_bytes))
            except Exception:
                labeled_path = None

        session = _pick_session(session_id_param)
        classify_row = None
        grade = str(ai_result.get("grade", "unknown")).strip().lower()
        confidence = float(ai_result.get("confidence", 0))
        min_conf = float(settings.ESP_MIN_CONFIDENCE)
        c_val, f_val = _grade_to_c(grade, confidence, min_conf)

        if session is not None:
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

        mqtt_body = {
            "c": c_val,
            "f": f_val,
            "grade": grade,
            "session_id": session.id if session else None,
            "classify_id": classify_row.id if classify_row else None,
            "device_id": device_id,
            "image_path": stored_path,
            "source": "esp_capture",
            "timestamp": timezone.now().isoformat(),
        }
        mqtt_ok = publish(TOPIC_CONVEYOR_SERVO, mqtt_body, qos=1)

        ws_payload = {
            "id": classify_row.id if classify_row else None,
            "session_id": classify_row.session_id if classify_row else (session.id if session else None),
            "raw_image_url": request.build_absolute_uri(f"/media/{raw_rel}"),
            "image_path": stored_path,
            "image_url": request.build_absolute_uri(f"/media/{stored_path}"),
            "labeled_image_path": labeled_path,
            "labeled_image_url": request.build_absolute_uri(f"/media/{labeled_path}") if labeled_path else None,
            "grade": grade,
            "confidence": confidence,
            "c": c_val,
            "f": f_val,
            "model_version": ai_result.get("model_version"),
            "inference_ms": ai_result.get("inference_ms"),
            "mock_mode": ai_result.get("mock_mode"),
            "warning": ai_result.get("warning"),
            "mqtt_topic": TOPIC_CONVEYOR_SERVO,
            "mqtt_published": mqtt_ok,
            "created_at": timezone.now().isoformat(),
        }
        broadcast_conveyor({"type": "classify_result", "data": ws_payload})

        return Response(
            {
                "ok": True,
                "c": c_val,
                "f": f_val,
                "grade": grade,
                "mqtt_topic": TOPIC_CONVEYOR_SERVO,
                "mqtt_published": mqtt_ok,
                "classify_id": classify_row.id if classify_row else None,
                "session_id": session.id if session else None,
            },
            status=status.HTTP_200_OK,
        )
