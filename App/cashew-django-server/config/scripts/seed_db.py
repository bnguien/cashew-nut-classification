import os

import django
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.conveyor.models import Alert, ClassifyResult, ConveyorSession  # noqa: E402
from apps.dashboard.models import AppUser, UserRole  # noqa: E402


def ensure_password(user: AppUser, raw_password: str):
    if not user.password.startswith("pbkdf2_"):
        user.password = make_password(raw_password)
        user.save(update_fields=["password"])


def seed_users():
    admin, _ = AppUser.objects.get_or_create(
        username="admin",
        defaults={
            "password": make_password("admin123"),
            "role": UserRole.ADMIN,
            "is_active": True,
        },
    )
    ensure_password(admin, "admin123")
    operator, _ = AppUser.objects.get_or_create(
        username="operator1",
        defaults={
            "password": make_password("operator123"),
            "role": UserRole.OPERATOR,
            "is_active": True,
        },
    )
    ensure_password(operator, "operator123")
    return admin, operator


def seed_sample_session(started_by: AppUser):
    now = timezone.now()
    session, _ = ConveyorSession.objects.get_or_create(
        started_by=started_by,
        started_at=now,
        defaults={
            "status": "completed",
            "ended_at": now,
            "total_count": 6,
            "whole_count": 3,
            "broken_count": 2,
            "defect_count": 1,
        },
    )

    samples = [
        ("media/cashew_images/sample_001.jpg", "whole", 0.97),
        ("media/cashew_images/sample_002.jpg", "broken", 0.89),
        ("media/cashew_images/sample_003.jpg", "defect", 0.78),
    ]
    for image_path, grade_name, confidence in samples:
        ClassifyResult.objects.get_or_create(
            session=session,
            image_path=image_path,
            defaults={
                "grade": grade_name,
                "confidence": confidence,
            },
        )

    Alert.objects.get_or_create(
        session=session,
        alert_type="warning",
        message="Detected unstable conveyor speed for 2 seconds.",
    )
    return session


if __name__ == "__main__":
    with transaction.atomic():
        _, operator = seed_users()
        seed_sample_session(started_by=operator)

    print("Seed data inserted successfully.")
