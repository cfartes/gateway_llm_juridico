from __future__ import annotations

from datetime import datetime, timedelta, timezone

import redis
from fastapi import HTTPException, Request, status

from app.core.config import settings


class RedisRateLimiter:
    def __init__(self) -> None:
        self.client = redis.Redis.from_url(settings.redis_url, decode_responses=True)

    def enforce(self, key: str, limit: int, window_seconds: int = 60) -> None:
        now = datetime.now(timezone.utc)
        bucket = now.replace(second=0, microsecond=0).isoformat()
        redis_key = f"rl:{key}:{bucket}"

        try:
            current = self.client.incr(redis_key)
            if current == 1:
                self.client.expire(redis_key, window_seconds)
            if current > limit:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
        except redis.RedisError:
            return


rate_limiter = RedisRateLimiter()


def rate_limit_dependency(request: Request, key: str) -> None:
    rate_limiter.enforce(key=key, limit=settings.rate_limit_per_minute)

