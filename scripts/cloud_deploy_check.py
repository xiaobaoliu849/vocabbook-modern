import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urljoin


@dataclass
class HttpResult:
    status: int
    body: str


def request(base_url: str, path: str, headers: dict[str, str] | None = None, timeout: float = 10.0) -> HttpResult:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return HttpResult(response.status, response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return HttpResult(exc.code, exc.read().decode("utf-8", errors="replace"))


def ok(message: str) -> None:
    print(f"[OK] {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def check_health(base_url: str, expect_production: bool) -> None:
    result = request(base_url, "/health")
    require(result.status == 200, f"/health returned HTTP {result.status}")
    payload = json.loads(result.body)
    require(payload.get("status") == "healthy", f"/health is not healthy: {payload}")
    require(payload.get("database") is True, f"Database check failed: {payload}")
    if expect_production:
        require(payload.get("environment") == "production", f"Expected production environment, got {payload}")
    ok("Health endpoint and database are healthy")


def check_openapi_routes(base_url: str) -> None:
    result = request(base_url, "/openapi.json")
    require(result.status == 200, f"/openapi.json returned HTTP {result.status}")
    payload = json.loads(result.body)
    routes = set(payload.get("paths", {}).keys())
    for route in (
        "/register",
        "/token",
        "/users/me",
        "/api/pay/native",
        "/api/pay/alipay/notify",
        "/api/orders/{out_trade_no}",
        "/admin/summary",
        "/admin/orders/{out_trade_no}/status",
        "/admin/payment/readiness",
    ):
        require(route in routes, f"Expected route missing from OpenAPI: {route}")
    ok("Auth, payment and admin routes are present")


def check_admin(base_url: str, admin_token: str | None) -> None:
    if admin_token:
        result = request(base_url, "/admin/summary", headers={"X-Admin-Token": admin_token})
        require(result.status == 200, f"/admin/summary with token returned HTTP {result.status}: {result.body}")
        ok("Admin API accepts configured token")
        return

    result = request(base_url, "/admin/summary")
    require(result.status == 403, f"/admin/summary without token should return 403, got {result.status}: {result.body}")
    ok("Admin API is configured and rejects missing token")


def check_payment_readiness(base_url: str, admin_token: str | None, expect_production: bool) -> None:
    if not admin_token:
        ok("Payment readiness positive check skipped without admin token")
        return

    result = request(base_url, "/admin/payment/readiness", headers={"X-Admin-Token": admin_token})
    require(result.status == 200, f"/admin/payment/readiness returned HTTP {result.status}: {result.body}")
    payload = json.loads(result.body)
    plans = payload.get("plans", {})
    premium = plans.get("premium_monthly", {})
    require(premium.get("amount_fen") == 2900, f"Unexpected premium_monthly amount: {premium}")
    require(premium.get("license_days") == 30, f"Unexpected premium_monthly duration: {premium}")
    if expect_production:
        require(payload.get("alipay_configured") is True, "Alipay client is not configured")
        require(payload.get("mock_payments_enabled") is False, "Mock payments must be disabled in production")
        require("sandbox" not in payload.get("gateway_url", "").lower(), "Alipay gateway still points to sandbox")
        require(payload.get("notify_url", "").startswith("https://"), "Alipay notify URL must be HTTPS")
    ok("Payment readiness is production-safe")


def main() -> int:
    parser = argparse.ArgumentParser(description="VocabBook cloud deployment smoke check")
    parser.add_argument("--base-url", default="http://127.0.0.1:8010", help="Cloud API base URL")
    parser.add_argument("--admin-token", default=None, help="Optional admin token for positive admin check")
    parser.add_argument("--expect-production", action="store_true", help="Require /health to report production")
    args = parser.parse_args()

    try:
        check_health(args.base_url, args.expect_production)
        check_openapi_routes(args.base_url)
        check_admin(args.base_url, args.admin_token)
        check_payment_readiness(args.base_url, args.admin_token, args.expect_production)
    except Exception as exc:
        print(f"[FAIL] {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
