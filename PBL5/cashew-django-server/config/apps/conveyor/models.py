from django.db import models
from django.utils import timezone


class SessionStatus(models.TextChoices):
    RUNNING = "running", "Running"
    COMPLETED = "completed", "Completed"
    STOPPED = "stopped", "Stopped"
    ERROR = "error", "Error"


class ConveyorSession(models.Model):
    started_by = models.ForeignKey(
        "dashboard.AppUser",
        on_delete=models.PROTECT,
        related_name="started_sessions",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=SessionStatus.choices,
        default=SessionStatus.RUNNING,
    )
    total_count = models.IntegerField(default=0)
    whole_count = models.IntegerField(default=0)
    broken_count = models.IntegerField(default=0)
    defect_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "conveyor_sessions"
        ordering = ["-started_at"]

    def __str__(self):
        return f"Session #{self.pk} - {self.status}"


class ClassifyResult(models.Model):
    session = models.ForeignKey(
        ConveyorSession,
        on_delete=models.CASCADE,
        related_name="classify_results",
    )
    image_path = models.CharField(max_length=255)
    grade = models.CharField(max_length=50)
    confidence = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "classify_results"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Result #{self.pk} - {self.grade} ({self.confidence:.2f})"


class Alert(models.Model):
    session = models.ForeignKey(
        ConveyorSession,
        on_delete=models.CASCADE,
        related_name="alerts",
    )
    alert_type = models.CharField(max_length=50)
    message = models.CharField(max_length=255)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "alerts"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.alert_type} - session {self.session_id}"
