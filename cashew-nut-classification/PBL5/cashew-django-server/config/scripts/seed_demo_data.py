import argparse
import os
import random
import sys
from datetime import timedelta
from pathlib import Path

import django
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.conveyor.models import Alert, ClassifyResult, ConveyorSession, SessionStatus  # noqa: E402
from apps.dashboard.models import AppUser, UserRole  # noqa: E402


def ensure_users():
    admin, _ = AppUser.objects.get_or_create(
        username="admin",
        defaults={
            "password": make_password("admin123"),
            "role": UserRole.ADMIN,
            "is_active": True,
        },
    )
    operator, _ = AppUser.objects.get_or_create(
        username="operator1",
        defaults={
            "password": make_password("operator123"),
            "role": UserRole.OPERATOR,
            "is_active": True,
        },
    )

    if not admin.password.startswith("pbkdf2_"):
        admin.password = make_password("admin123")
        admin.save(update_fields=["password"])
    if not operator.password.startswith("pbkdf2_"):
        operator.password = make_password("operator123")
        operator.save(update_fields=["password"])

    return admin, operator


def create_session(operator: AppUser, total: int, whole: int, broken: int, defect: int, minutes_ago: int):
    started_at = timezone.now() - timedelta(minutes=minutes_ago)
    ended_at = started_at + timedelta(minutes=45)
    return ConveyorSession.objects.create(
        started_by=operator,
        started_at=started_at,
        ended_at=ended_at,
        status=SessionStatus.COMPLETED,
        total_count=total,
        whole_count=whole,
        broken_count=broken,
        defect_count=defect,
    )


def build_result_rows(session: ConveyorSession, counts: dict[str, int]):
    rows = []
    now = timezone.now()
    idx = 0
    for grade_name in ["whole", "broken", "defect"]:
        for _ in range(counts[grade_name]):
            idx += 1
            rows.append(
                ClassifyResult(
                    session=session,
                    image_path="",
                    grade=grade_name,
                    confidence=round(random.uniform(0.76, 0.99), 4),
                    created_at=now - timedelta(seconds=(counts["whole"] + counts["broken"] + counts["defect"] - idx)),
                )
            )
    return rows


def seed(reset: bool):
    with transaction.atomic():
        if reset:
            ClassifyResult.objects.all().delete()
            Alert.objects.all().delete()
            ConveyorSession.objects.all().delete()

        _, operator = ensure_users()

        session_1 = create_session(operator, total=200, whole=140, broken=40, defect=20, minutes_ago=180)
        session_2 = create_session(operator, total=210, whole=150, broken=40, defect=20, minutes_ago=95)

        rows = []
        rows.extend(build_result_rows(session_1, {"whole": 140, "broken": 40, "defect": 20}))
        rows.extend(build_result_rows(session_2, {"whole": 150, "broken": 40, "defect": 20}))
        ClassifyResult.objects.bulk_create(rows, batch_size=500)

        Alert.objects.create(
            session=session_1,
            alert_type="defect_threshold",
            message="Ti le hat hong vuot nguong 20%",
            is_read=False,
        )
        Alert.objects.create(
            session=session_2,
            alert_type="connection_lost",
            message="ESP32 mat ket noi tam thoi",
            is_read=True,
        )

    print("Done seeding demo data.")
    print("Login accounts:")
    print("- admin / admin123")
    print("- operator1 / operator123")
    print("Inserted sessions: 2 (~200 hats per session).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo conveyor data quickly.")
    parser.add_argument("--reset", action="store_true", help="Delete old session/result/alert/log data before seeding.")
    args = parser.parse_args()
    seed(reset=args.reset)
