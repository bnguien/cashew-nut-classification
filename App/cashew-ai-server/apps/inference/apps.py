from django.apps import AppConfig


class InferenceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.inference"

    def ready(self) -> None:
        """
        Warm up the model backend immediately when Django starts.
        This runs once per worker process, firing a dummy inference so the
        first real ESP request does NOT pay the cold-start penalty (~3900ms).
        Runs in a background thread to not block server startup.
        """
        import threading

        def _warmup() -> None:
            import io
            import logging

            logger = logging.getLogger(__name__)
            try:
                from PIL import Image

                from .services.classifier import _load_model

                backend = _load_model()
                if backend is None:
                    logger.warning("[inference.warmup] Model failed to load at startup.")
                    return

                # Synthesize a minimal blank image in RAM — no disk I/O
                img = Image.new("RGB", (240, 240), color=(128, 128, 128))
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=80)

                backend.predict(buf.getvalue(), return_annotation=False)
                logger.info(
                    "[inference.warmup] Model '%s' warmed up successfully (backend=%s).",
                    backend.model_path(),
                    backend.name,
                )
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "[inference.warmup] Warmup failed (non-fatal): %s", exc
                )

        thread = threading.Thread(target=_warmup, daemon=True, name="model-warmup")
        thread.start()
