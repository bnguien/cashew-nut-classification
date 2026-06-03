"""
classifier.py — Multi-backend inference engine for Cashew AI Server.

Supported model formats (auto-detected by file extension):
  .pt  / .pth   → Ultralytics YOLO  (detection or classification task)
  .tflite        → TensorFlow Lite   (MobileNetV2-style classification)

The active backend is chosen once at startup via _load_model() and cached
for the lifetime of the process.  To hot-swap a model, restart the server
(or call reset_model() from management commands / tests).

ENV vars consumed via settings:
  MODEL_PATH        – path to model file (required)
  MODEL_VERSION     – human-readable label returned in every response
  MODEL_TYPE        – optional: "yolo" | "tflite" | "auto" (default: "auto")
  AI_MIN_CONFIDENCE – predictions below this threshold → low-conf error
  AI_IMGSZ          – resize target for YOLO inference (default: 640)
  AI_HALF           – fp16 inference for YOLO on CUDA (default: false)
  MOCK_MODE         – bypass all inference and return deterministic mock
"""
from __future__ import annotations

import base64
import hashlib
import io
import logging
import sys
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from django.conf import settings
from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Grade vocabulary
# ---------------------------------------------------------------------------

GRADES: list[str] = ["whole", "broken", "defect"]

GRADE_ALIASES: dict[str, str] = {
    "whole": "whole",
    "normal": "whole",
    "intact": "whole",
    "good": "whole",
    "broken": "broken",
    "split": "broken",
    "crack": "broken",
    "cracked": "broken",
    "defect": "defect",
    "defective": "defect",
    "bad": "defect",
    "damaged": "defect",
}

# Index-based fallback for models whose class names are 0 / 1 / 2
_INDEX_GRADE_MAP: dict[int, str] = {0: "whole", 1: "broken", 2: "defect"}

# ---------------------------------------------------------------------------
# Singleton state (module-level, one per worker process)
# ---------------------------------------------------------------------------

_backend: "BaseModelBackend | None" = None
_load_error: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _image_to_b64_jpeg(image: Image.Image, quality: int = 90) -> str:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _normalize_grade(raw_label: str) -> str:
    key = str(raw_label).strip().lower().replace("-", "_").replace(" ", "_")
    if key in GRADE_ALIASES:
        return GRADE_ALIASES[key]
    for alias, grade in GRADE_ALIASES.items():
        if alias in key:
            return grade
    return "unknown"


def _resolve_label(names: Any, index: int) -> str:
    if isinstance(names, dict):
        return str(names.get(index, index))
    if isinstance(names, (list, tuple)) and 0 <= index < len(names):
        return str(names[index])
    return str(index)


def _make_ok(
    grade: str,
    confidence: float,
    started: float,
    *,
    annotated_b64: str | None = None,
    backend_name: str = "",
    model_path: str = "",
    mock_mode: bool = False,
    warning: str | None = None,
) -> dict:
    payload: dict = {
        "ok": True,
        "grade": grade,
        "confidence": round(confidence, 4),
        "model_version": settings.MODEL_VERSION,
        "inference_ms": round((time.perf_counter() - started) * 1000, 2),
        "mock_mode": mock_mode,
        "model_path": model_path or settings.MODEL_PATH,
        "backend": backend_name,
        "annotated_image_base64": annotated_b64,
    }
    if warning:
        payload["warning"] = warning
    return payload


def _make_error(started: float, message: str) -> dict:
    return {
        "ok": False,
        "message": message,
        "model_version": settings.MODEL_VERSION,
        "inference_ms": round((time.perf_counter() - started) * 1000, 2),
        "mock_mode": False,
    }


# ---------------------------------------------------------------------------
# Mock backend
# ---------------------------------------------------------------------------


def _mock_result(
    image_bytes: bytes,
    started: float,
    reason: str | None = None,
    *,
    return_annotation: bool = True,
) -> dict:
    digest = hashlib.sha256(image_bytes).hexdigest()
    idx = int(digest[:2], 16) % len(GRADES)
    confidence = 0.75 + (int(digest[2:6], 16) % 2500) / 10000

    annotated_b64 = None
    if return_annotation:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            draw = ImageDraw.Draw(image)
            draw.rectangle(
                [(12, 12), (image.width - 12, image.height - 12)],
                outline=(255, 180, 0),
                width=4,
            )
            draw.text(
                (20, 20),
                f"{GRADES[idx]} {round(min(confidence, 0.99), 2)} (mock)",
                fill=(255, 180, 0),
            )
            annotated_b64 = _image_to_b64_jpeg(image)
        except Exception:
            annotated_b64 = None

    return _make_ok(
        GRADES[idx],
        round(min(confidence, 0.99), 4),
        started,
        annotated_b64=annotated_b64,
        backend_name="mock",
        mock_mode=True,
        warning=reason,
    )


# ---------------------------------------------------------------------------
# Abstract backend interface
# ---------------------------------------------------------------------------


class BaseModelBackend(ABC):
    """Every concrete backend must implement predict()."""

    name: str = "base"

    @abstractmethod
    def predict(
        self, image_bytes: bytes, *, return_annotation: bool
    ) -> tuple[str, float, str | None]:
        """
        Returns (grade, confidence, annotated_image_base64_or_None).
        Raises on fatal error so the caller can wrap into _make_error.
        """

    def model_path(self) -> str:
        return settings.MODEL_PATH


# ---------------------------------------------------------------------------
# YOLO backend  (.pt / .pth)
# ---------------------------------------------------------------------------


class YOLOBackend(BaseModelBackend):
    name = "yolo"

    def __init__(self, model_path: str) -> None:
        try:
            from ultralytics import YOLO  # type: ignore[import]
        except ModuleNotFoundError:
            venv_site = Path(settings.BASE_DIR) / "venv" / "Lib" / "site-packages"
            if venv_site.exists():
                sys.path.insert(0, str(venv_site))
            from ultralytics import YOLO  # type: ignore[import]

        self._model = YOLO(model_path)
        self._model_path = model_path
        logger.info("[classifier] YOLO backend loaded: %s", model_path)

    def model_path(self) -> str:
        return self._model_path

    # ------------------------------------------------------------------
    def predict(
        self, image_bytes: bytes, *, return_annotation: bool
    ) -> tuple[str, float, str | None]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        imgsz = int(getattr(settings, "AI_IMGSZ", 640))
        half = bool(getattr(settings, "AI_HALF", False))

        predictions = self._model.predict(
            source=image, verbose=False, imgsz=imgsz, half=half
        )
        if not predictions:
            raise ValueError("No prediction returned by YOLO model.")

        top = predictions[0]
        names = getattr(top, "names", None) or getattr(self._model, "names", None)

        if getattr(top, "probs", None) is not None:
            # Classification task
            label = _resolve_label(names, int(top.probs.top1)).strip().lower()
            grade = _normalize_grade(label)
            confidence = float(top.probs.top1conf)
        elif getattr(top, "boxes", None) is not None and len(top.boxes) > 0:
            # Detection task
            grade, confidence = self._classify_from_boxes(top, names)
        else:
            raise ValueError("Prediction contained no class probabilities or boxes.")

        annotated_b64 = None
        if return_annotation:
            annotated_bgr = top.plot()
            annotated_rgb = annotated_bgr[:, :, ::-1]
            annotated_b64 = _image_to_b64_jpeg(Image.fromarray(annotated_rgb))

        return grade, round(confidence, 4), annotated_b64

    @staticmethod
    def _classify_from_boxes(top: Any, names: Any) -> tuple[str, float]:
        conf_list = top.boxes.conf.detach().cpu().tolist()
        cls_list = top.boxes.cls.detach().cpu().tolist()
        xyxy_list = top.boxes.xyxy.detach().cpu().tolist()
        img_h, img_w = top.orig_shape
        img_area = max(float(img_w * img_h), 1.0)

        class_scores: dict[str, float] = {}
        class_conf_max: dict[str, float] = {}

        for cls_raw, conf_raw, xyxy in zip(cls_list, conf_list, xyxy_list):
            label = _resolve_label(names, int(cls_raw))
            grade = _normalize_grade(label)
            x1, y1, x2, y2 = xyxy
            box_area = max(x2 - x1, 0.0) * max(y2 - y1, 0.0)
            area_ratio = min(max(box_area / img_area, 0.0), 1.0)
            score = float(conf_raw) * (0.5 + 0.5 * area_ratio)
            class_scores[grade] = class_scores.get(grade, 0.0) + score
            class_conf_max[grade] = max(class_conf_max.get(grade, 0.0), float(conf_raw))

        if not class_scores:
            return "unknown", 0.0
        best = max(class_scores, key=class_scores.__getitem__)
        return best, round(class_conf_max.get(best, 0.0), 4)


# ---------------------------------------------------------------------------
# TFLite backend  (.tflite)
# ---------------------------------------------------------------------------

# Expected input shape: [1, H, W, 3]  (uint8 or float32).
# Expected output shape: [1, N_CLASSES] — softmax probabilities.
# Class order must match GRADES = ["whole", "broken", "defect"].
_TFLITE_INPUT_SIZE = int(getattr(settings, "AI_TFLITE_INPUT_SIZE", 224))
_TFLITE_CLASSES: list[str] = list(
    getattr(settings, "AI_TFLITE_CLASSES", GRADES)  # override via settings if needed
)


class TFLiteBackend(BaseModelBackend):
    name = "tflite"

    def __init__(self, model_path: str) -> None:
        try:
            import tensorflow as tf  # type: ignore[import]
            self._interpreter = tf.lite.Interpreter(model_path=model_path)
        except (ImportError, ModuleNotFoundError):
            # Fallback: tflite-runtime (lighter package)
            try:
                import tflite_runtime.interpreter as tflite  # type: ignore[import]
                self._interpreter = tflite.Interpreter(model_path=model_path)
            except (ImportError, ModuleNotFoundError) as exc:
                raise RuntimeError(
                    "Neither 'tensorflow' nor 'tflite-runtime' is installed. "
                    "Run: pip install tflite-runtime"
                ) from exc

        self._interpreter.allocate_tensors()
        self._input_details = self._interpreter.get_input_details()
        self._output_details = self._interpreter.get_output_details()
        self._model_path = model_path

        # Detect expected input H×W from tensor shape [batch, H, W, C]
        shape = self._input_details[0]["shape"]  # e.g. [1, 224, 224, 3]
        self._input_h = int(shape[1])
        self._input_w = int(shape[2])
        self._is_uint8 = self._input_details[0]["dtype"].__name__ == "uint8"

        logger.info(
            "[classifier] TFLite backend loaded: %s  input=%dx%d  dtype=%s",
            model_path,
            self._input_h,
            self._input_w,
            self._input_details[0]["dtype"].__name__,
        )

    def model_path(self) -> str:
        return self._model_path

    def _preprocess(self, image_bytes: bytes):
        """Resize + normalize image to model input tensor."""
        import numpy as np  # type: ignore[import]

        # 1. Request (image) -> Decode
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # 2. Auto-crop (optional) - Center crop to make it square if it isn't
        w, h = image.size
        if w != h:
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            image = image.crop((left, top, left + side, top + side))

        # 3. Resize (to model input size, typically 224x224 for MobileNetV2)
        image = image.resize((self._input_w, self._input_h), Image.BILINEAR)
        arr = np.array(image, dtype=np.uint8)

        # 4. Convert dtype & 5. Add batch dim
        if self._is_uint8:
            # Quantized model — feed raw uint8 [0, 255]
            return arr[None]  # shape: [1, H, W, 3]
        else:
            # Float model — normalize to [-1, 1] (MobileNetV2 convention)
            return (arr.astype("float32") / 127.5 - 1.0)[None]

    def _annotate(self, image_bytes: bytes, grade: str, confidence: float) -> str:
        """Draw a simple label box on the original image."""
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        draw = ImageDraw.Draw(image)
        draw.rectangle(
            [(8, 8), (image.width - 8, image.height - 8)],
            outline=(0, 200, 100),
            width=3,
        )
        draw.text((16, 16), f"{grade} {round(confidence, 2)}", fill=(0, 200, 100))
        return _image_to_b64_jpeg(image)

    def predict(
        self, image_bytes: bytes, *, return_annotation: bool
    ) -> tuple[str, float, str | None]:
        import numpy as np  # type: ignore[import]

        tensor = self._preprocess(image_bytes)
        self._interpreter.set_tensor(self._input_details[0]["index"], tensor)
        self._interpreter.invoke()
        output = self._interpreter.get_tensor(self._output_details[0]["index"])[0]

        if self._is_uint8:
            # Dequantize
            scale, zero_point = self._output_details[0]["quantization"]
            output = (output.astype("float32") - zero_point) * scale

        probs = output.tolist()
        classes = _TFLITE_CLASSES

        # Align output length to class list (safety guard)
        n = min(len(probs), len(classes))
        best_idx = int(np.argmax(probs[:n]))
        confidence = float(probs[best_idx])
        raw_label = classes[best_idx] if best_idx < len(classes) else str(best_idx)
        grade = _normalize_grade(raw_label)

        annotated_b64 = None
        if return_annotation:
            annotated_b64 = self._annotate(image_bytes, grade, confidence)

        return grade, round(confidence, 4), annotated_b64


# ---------------------------------------------------------------------------
# Backend factory
# ---------------------------------------------------------------------------

_EXTENSION_MAP: dict[str, str] = {
    ".pt": "yolo",
    ".pth": "yolo",
    ".tflite": "tflite",
}


def _detect_backend_type(model_path: str) -> str:
    """Return backend key based on MODEL_TYPE env or file extension."""
    explicit = str(getattr(settings, "MODEL_TYPE", "auto")).strip().lower()
    if explicit and explicit != "auto":
        return explicit
    ext = Path(model_path).suffix.lower()
    backend = _EXTENSION_MAP.get(ext)
    if backend is None:
        raise ValueError(
            f"Cannot determine model backend for extension '{ext}'. "
            "Set MODEL_TYPE=yolo|tflite in .env to override."
        )
    return backend


def _build_backend(model_path: str) -> BaseModelBackend:
    backend_type = _detect_backend_type(model_path)
    if backend_type == "yolo":
        return YOLOBackend(model_path)
    if backend_type == "tflite":
        return TFLiteBackend(model_path)
    raise ValueError(f"Unknown MODEL_TYPE: '{backend_type}'. Use 'yolo' or 'tflite'.")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def reset_model() -> None:
    """Force-reload backend on next classify_image() call (useful for tests)."""
    global _backend, _load_error
    _backend = None
    _load_error = None


def _load_model() -> "BaseModelBackend | None":
    global _backend, _load_error
    if _backend is not None:
        return _backend
    if _load_error is not None:
        return None

    model_path_str = str(getattr(settings, "MODEL_PATH", ""))
    model_path = Path(model_path_str)

    if not model_path.exists():
        _load_error = f"Model file not found: {model_path}"
        logger.error("[classifier] %s", _load_error)
        return None

    try:
        _backend = _build_backend(str(model_path))
        return _backend
    except Exception as exc:
        _load_error = str(exc)
        logger.exception("[classifier] Failed to load model: %s", exc)
        return None


def classify_image(image_bytes: bytes, *, return_annotation: bool = True) -> dict:
    """
    Main entry-point called by PredictAPIView.
    Returns a dict with at least keys: ok, grade, confidence, model_version,
    inference_ms, mock_mode, annotated_image_base64.
    """
    started = time.perf_counter()

    if settings.MOCK_MODE:
        return _mock_result(
            image_bytes, started, reason="MOCK_MODE=true", return_annotation=return_annotation
        )

    backend = _load_model()
    if backend is None:
        return _make_error(started, f"Model load failed: {_load_error}")

    min_conf = float(getattr(settings, "AI_MIN_CONFIDENCE", 0.25))

    try:
        grade, confidence, annotated_b64 = backend.predict(
            image_bytes, return_annotation=return_annotation
        )
    except Exception as exc:
        logger.exception("[classifier] Inference error: %s", exc)
        return _make_error(started, f"Inference error: {exc}")

    if confidence < min_conf:
        return _make_error(
            started,
            f"Low confidence: {round(confidence, 4)} < threshold {min_conf}",
        )

    return _make_ok(
        grade,
        confidence,
        started,
        annotated_b64=annotated_b64,
        backend_name=backend.name,
        model_path=backend.model_path(),
    )
