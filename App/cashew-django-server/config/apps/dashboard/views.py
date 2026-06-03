from django.db.models import Count, Sum
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AppUser
from .permissions import IsAdminRole
from .serializers import AdminUserCreateSerializer, AdminUserSerializer, AdminUserUpdateSerializer

from apps.conveyor.models import ConveyorSession


class DashboardStatsView(APIView):
    def get(self, request):
        latest_session_id = request.query_params.get("session_id")
        session_qs = ConveyorSession.objects.all()
        if latest_session_id:
            session_qs = session_qs.filter(id=latest_session_id)

        session_by_status = (
            session_qs.values("status").annotate(total=Count("id")).order_by("status")
        )
        totals = session_qs.aggregate(
            sessions=Count("id"),
            total_count=Sum("total_count"),
            whole_count=Sum("whole_count"),
            broken_count=Sum("broken_count"),
            defect_count=Sum("defect_count"),
        )
        total_count = totals["total_count"] or 0
        defect_count = totals["defect_count"] or 0
        defect_rate = (defect_count / total_count) if total_count else 0

        payload = {
            "users": AppUser.objects.count(),
            "sessions": totals["sessions"] or 0,
            "logs": 0,
            "total_count": total_count,
            "whole_count": totals["whole_count"] or 0,
            "broken_count": totals["broken_count"] or 0,
            "defect_count": defect_count,
            "defect_rate": defect_rate,
            "session_by_status": list(session_by_status),
        }
        return Response(payload)


class AdminUserViewSet(viewsets.ModelViewSet):
    queryset = AppUser.objects.all().order_by("id")
    permission_classes = [IsAdminRole]

    def get_serializer_class(self):
        if self.action == "create":
            return AdminUserCreateSerializer
        if self.action in {"update", "partial_update"}:
            return AdminUserUpdateSerializer
        return AdminUserSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id:
            return Response({"detail": "Admin cannot delete own account."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)
