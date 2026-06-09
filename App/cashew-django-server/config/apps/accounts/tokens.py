from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from rest_framework import exceptions

ACCESS_TOKEN_MAX_AGE = 60 * 60  # 1 hour
REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

JWT_ALGORITHM = "HS256"


def _issue_token(user_id: int, token_type: str, max_age_seconds: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "uid": int(user_id),
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=max_age_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _issue_token(user_id=user_id, token_type="access", max_age_seconds=ACCESS_TOKEN_MAX_AGE)


def create_refresh_token(user_id: int) -> str:
    return _issue_token(user_id=user_id, token_type="refresh", max_age_seconds=REFRESH_TOKEN_MAX_AGE)


def _verify_token(token: str, expected_type: str) -> int:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise exceptions.AuthenticationFailed("Token expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise exceptions.AuthenticationFailed("Invalid token.") from exc

    token_type = payload.get("type")
    if token_type != expected_type:
        raise exceptions.AuthenticationFailed(f"Invalid token type. Expected {expected_type}.")

    user_id = payload.get("uid")
    if user_id is None:
        raise exceptions.AuthenticationFailed("Token missing uid.")
    return int(user_id)


def verify_access_token(token: str) -> int:
    return _verify_token(token, expected_type="access")


def verify_refresh_token(token: str) -> int:
    return _verify_token(token, expected_type="refresh")
