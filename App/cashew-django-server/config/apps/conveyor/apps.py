from django.apps import AppConfig


class ConveyorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.conveyor"

    def ready(self):
        import sys

        blocked_commands = {"makemigrations", "migrate", "collectstatic", "test"}
        if len(sys.argv) > 1 and sys.argv[1] in blocked_commands:
            return
        from .services.mqtt_service import start_mqtt_listener

        start_mqtt_listener()
