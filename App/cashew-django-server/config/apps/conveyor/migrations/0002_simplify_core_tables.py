import django.db.models.deletion
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("dashboard", "0002_simplify_auth_user_schema"),
        ("conveyor", "0001_initial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="classifyresult",
            name="grade_config",
        ),
        migrations.RemoveField(
            model_name="conveyorsession",
            name="splitdown_count",
        ),
        migrations.RemoveField(
            model_name="conveyorsession",
            name="splitup_count",
        ),
        migrations.RemoveField(
            model_name="conveyorsession",
            name="conveyor_speed",
        ),
        migrations.RemoveField(
            model_name="classifyresult",
            name="delay_ms",
        ),
        migrations.RemoveField(
            model_name="classifyresult",
            name="servo_angle",
        ),
        migrations.AddField(
            model_name="alert",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="alert",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="alert",
            name="read_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="classifyresult",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="classifyresult",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="conveyorsession",
            name="created_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name="conveyorsession",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="conveyorsession",
            name="is_deleted",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="conveyorsession",
            name="updated_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AlterField(
            model_name="conveyorsession",
            name="started_by",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="started_sessions", to="dashboard.appuser"),
        ),
        migrations.DeleteModel(
            name="GradeConfig",
        ),
    ]
