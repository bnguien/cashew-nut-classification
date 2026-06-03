from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("dashboard", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "SET FOREIGN_KEY_CHECKS = 0; "
                "DROP TABLE IF EXISTS auth_user_groups; "
                "DROP TABLE IF EXISTS auth_user_user_permissions; "
                "DROP TABLE IF EXISTS auth_group_permissions; "
                "DROP TABLE IF EXISTS auth_permission; "
                "DROP TABLE IF EXISTS auth_group; "
                "DROP TABLE IF EXISTS auth_user; "
                "SET FOREIGN_KEY_CHECKS = 1;"
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AlterModelTable(
            name="appuser",
            table="auth_user",
        ),
        migrations.RenameField(
            model_name="appuser",
            old_name="password_hash",
            new_name="password",
        ),
        migrations.RemoveField(
            model_name="appuser",
            name="full_name",
        ),
        migrations.RemoveField(
            model_name="appuser",
            name="last_login",
        ),
        migrations.AddField(
            model_name="appuser",
            name="updated_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.DeleteModel(
            name="SystemLog",
        ),
    ]
