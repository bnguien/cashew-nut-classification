from django.conf import settings
from rest_framework import serializers

from .models import Alert, ClassifyResult, ConveyorSession


class ClassifyResultSerializer(serializers.ModelSerializer):
    session_id = serializers.IntegerField(source="session.id", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ClassifyResult
        fields = [
            "id",
            "session",
            "session_id",
            "image_path",
            "image_url",
            "grade",
            "confidence",
            "created_at",
            "is_deleted",
            "deleted_at",
        ]

    def get_image_url(self, obj: ClassifyResult) -> str | None:
        if not obj.image_path:
            return None
        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(f"{settings.MEDIA_URL}{obj.image_path}")
        return None


class AlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alert
        fields = [
            "id",
            "session",
            "alert_type",
            "message",
            "is_read",
            "read_at",
            "created_at",
            "is_deleted",
            "deleted_at",
        ]


class ConveyorSessionSerializer(serializers.ModelSerializer):
    classify_results_count = serializers.IntegerField(source="classify_results.count", read_only=True)
    alerts_count = serializers.IntegerField(source="alerts.count", read_only=True)

    class Meta:
        model = ConveyorSession
        fields = [
            "id",
            "started_by",
            "started_at",
            "ended_at",
            "status",
            "total_count",
            "whole_count",
            "broken_count",
            "defect_count",
            "created_at",
            "updated_at",
            "is_deleted",
            "deleted_at",
            "classify_results_count",
            "alerts_count",
        ]
