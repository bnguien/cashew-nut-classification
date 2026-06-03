from .mqtt_service import publish_command, publish_servo


def send_servo_angle(angle: int, grade: str = "unknown", session_id: int | None = None) -> dict:
    ok = publish_servo(grade=grade, angle=angle, session_id=session_id)
    return {"ok": ok, "topic": "conveyor/servo"}


def send_command(command: str, session_id: int | None = None) -> dict:
    ok = publish_command(command=command, session_id=session_id)
    return {"ok": ok, "topic": "conveyor/command"}
