from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none';"
        if settings.force_https:
            response.headers["Strict-Transport-Security"] = f"max-age={settings.hsts_seconds}; includeSubDomains"
        return response


class EnforceHTTPSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.force_https:
            return await call_next(request)

        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        if request.url.scheme != "https" and forwarded_proto.lower() != "https":
            return JSONResponse(
                status_code=400,
                content={"detail": "HTTPS is required"},
            )
        return await call_next(request)
