import os

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import PredictInputSerializer
from .services.classifier import classify_image


class HealthAPIView(APIView):
    def get(self, request):
        model_exists = settings.MODEL_PATH and os.path.exists(settings.MODEL_PATH)
        return Response(
            {
                "status": "ok",
                "service": "inference",
                "mock_mode": settings.MOCK_MODE,
                "model_path": settings.MODEL_PATH,
                "model_version": settings.MODEL_VERSION,
                "model_exists": bool(model_exists),
            }
        )


class PredictAPIView(APIView):
    def post(self, request):
        serializer = PredictInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"ok": False, "message": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        raw = (request.query_params.get("annotate") or "").strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return_annotation = True
        elif raw in ("0", "false", "no", "off"):
            return_annotation = False
        else:
            return_annotation = settings.AI_RETURN_ANNOTATED_IMAGE_DEFAULT

        image_file = serializer.validated_data["image"]
        image_bytes = image_file.read()
        result = classify_image(image_bytes, return_annotation=return_annotation)
        return Response(result, status=status.HTTP_200_OK)
