import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from urllib.parse import urljoin


@dataclass
class HttpResult:
    status: int
    body: str


def request(base_url: str, method: str, path: str, *, headers=None, data=None, timeout=20.0) -> HttpResult:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    body = None
    request_headers = dict(headers or {})
    if isinstance(data, dict):
        if request_headers.get("Content-Type") == "application/x-www-form-urlencoded":
            body = urllib.parse.urlencode(data).encode("utf-8")
        else:
            body = json.dumps(data).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return HttpResult(response.status, response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return HttpResult(exc.code, exc.read().decode("utf-8", errors="replace"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def parse_json(result: HttpResult) -> dict:
    try:
        return json.loads(result.body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Expected JSON, got HTTP {result.status}: {result.body}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Create and inspect a real Alipay order for release smoke testing")
    parser.add_argument("--base-url", default="https://api.historyai.fun")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--register", action="store_true", help="Register the account first if needed")
    parser.add_argument("--admin-token", default=None, help="Optional admin token for payment readiness check")
    args = parser.parse_args()

    try:
        if args.admin_token:
            readiness = request(args.base_url, "GET", "/admin/payment/readiness", headers={"X-Admin-Token": args.admin_token})
            require(readiness.status == 200, f"Payment readiness failed: HTTP {readiness.status} {readiness.body}")
            readiness_payload = parse_json(readiness)
            require(readiness_payload.get("alipay_configured") is True, "Alipay is not configured")
            require(readiness_payload.get("mock_payments_enabled") is False, "Mock payments are enabled")
            print("[OK] Payment readiness passed")

        if args.register:
            registered = request(args.base_url, "POST", "/register", data={"email": args.email, "password": args.password})
            require(registered.status in (200, 400), f"Register failed: HTTP {registered.status} {registered.body}")
            print(f"[OK] Register step returned HTTP {registered.status}")

        token_result = request(
            args.base_url,
            "POST",
            "/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"username": args.email, "password": args.password},
        )
        require(token_result.status == 200, f"Login failed: HTTP {token_result.status} {token_result.body}")
        token = parse_json(token_result)["access_token"]
        print("[OK] Login passed")

        order_result = request(
            args.base_url,
            "POST",
            "/api/pay/native",
            headers={"Authorization": f"Bearer {token}"},
            data={"plan_id": "premium_monthly"},
        )
        require(order_result.status == 200, f"Create order failed: HTTP {order_result.status} {order_result.body}")
        order = parse_json(order_result)
        require(order.get("code_url"), f"Order did not include QR code URL: {order}")
        out_trade_no = order["out_trade_no"]
        print(f"[OK] Created Alipay order: {out_trade_no}")
        print(f"QR URL: {order['code_url']}")

        status_result = request(args.base_url, "GET", f"/api/orders/{out_trade_no}", headers={"Authorization": f"Bearer {token}"})
        require(status_result.status == 200, f"Order status failed: HTTP {status_result.status} {status_result.body}")
        status_payload = parse_json(status_result)
        require(status_payload.get("status") == "PENDING", f"Expected PENDING before payment, got {status_payload}")
        require(status_payload.get("amount_fen") == 2900, f"Unexpected amount: {status_payload}")
        print("[OK] Order status is PENDING with expected amount")
    except Exception as exc:
        print(f"[FAIL] {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
