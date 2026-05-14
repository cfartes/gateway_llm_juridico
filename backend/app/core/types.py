from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"


class TenantPlan(StrEnum):
    STARTER = "starter"
    GROWTH = "growth"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"


class ScanStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

