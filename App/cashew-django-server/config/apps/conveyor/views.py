from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Alert, ClassifyResult, ConveyorSession, SessionStatus
from .serializers import AlertSerializer, ClassifyResultSerializer, ConveyorSessionSerializer
from .services.esp32_ctrl import send_command
from .services.mqtt_service import get_esp_connected
from apps.websocket.events import broadcast_conveyor


class ConveyorSessionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ConveyorSession.objects.select_related("started_by").filter(is_deleted=False)
    serializer_class = ConveyorSessionSerializer

    @action(detail=False, methods=["post"], url_path="start")
    def start_session(self, request):
        running = ConveyorSession.objects.filter(
            status=SessionStatus.RUNNING, is_deleted=False
        ).first()
        if running:
            return Response(
                {
                    "detail": "A session is already running.",
                    "session": self.get_serializer(running).data,
                    "ui_hint": {
                        "esp_active": True,
                        "show_popup": False,
                        "message": "Băng chuyền đang chạy.",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        session = ConveyorSession.objects.create(
            started_by=user,
            status=SessionStatus.RUNNING,
        )

        ctrl = send_command(command="start", session_id=session.id)
        broadcast_conveyor(
            {
                "type": "session_started",
                "data": {
                    "session_id": session.id,
                    "started_by": getattr(user, "username", str(user)),
                    "esp_command_sent": ctrl.get("ok", False),
                },
            }
        )

        return Response(
            {
                "session": self.get_serializer(session).data,
                "ui_hint": {
                    "esp_active": True,
                    "show_popup": False,
                    "message": "Băng chuyền đã khởi động.",
                },
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="stop")
    def stop_session(self, request):
        running = ConveyorSession.objects.filter(
            status=SessionStatus.RUNNING, is_deleted=False
        ).order_by("-started_at").first()
        if not running:
            return Response(
                {
                    "detail": "No running session found.",
                    "ui_hint": {
                        "esp_active": False,
                        "show_popup": False,
                        "message": "Không có phiên đang chạy.",
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        running.status = SessionStatus.COMPLETED
        running.ended_at = timezone.now()
        running.save(update_fields=["status", "ended_at"])

        ctrl = send_command(command="stop", session_id=running.id)
        broadcast_conveyor(
            {
                "type": "session_stopped",
                "data": {
                    "session_id": running.id,
                    "stopped_by": getattr(request.user, "username", str(request.user)),
                    "esp_command_sent": ctrl.get("ok", False),
                },
            }
        )

        return Response(
            {
                "session": self.get_serializer(running).data,
                "ui_hint": {
                    "esp_active": False,
                    "show_popup": False,
                    "message": "Băng chuyền đã dừng.",
                },
            }
        )


class ClassifyResultViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ClassifyResult.objects.select_related("session").filter(
        is_deleted=False, session__is_deleted=False
    )
    serializer_class = ClassifyResultSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        session_id = self.request.query_params.get("session_id")
        if session_id:
            queryset = queryset.filter(session_id=session_id)
        return queryset


class AlertViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Alert.objects.select_related("session").filter(
        is_deleted=False, session__is_deleted=False
    )
    serializer_class = AlertSerializer

    @action(detail=True, methods=["patch"], url_path="read")
    def mark_read(self, request, pk=None):
        alert = self.get_object()
        if not alert.is_read:
            alert.is_read = True
            alert.read_at = timezone.now()
            alert.save(update_fields=["is_read", "read_at"])
        return Response(self.get_serializer(alert).data)


class ConveyorOverviewView(APIView):
    def get(self, request):
        running_session = ConveyorSession.objects.filter(
            status=SessionStatus.RUNNING, is_deleted=False
        ).order_by("-started_at").first()
        latest_result = ClassifyResult.objects.filter(
            is_deleted=False, session__is_deleted=False
        ).order_by("-created_at").first()
        unread_alerts = Alert.objects.filter(
            is_read=False, is_deleted=False, session__is_deleted=False
        ).count()

        return Response(
            {
                "is_running": running_session is not None,
                "running_session_id": running_session.id if running_session else None,
                "latest_result": ClassifyResultSerializer(
                    latest_result, context={"request": request}
                ).data if latest_result else None,
                "unread_alerts": unread_alerts,
                "esp_connected": get_esp_connected(),
            }
        )
