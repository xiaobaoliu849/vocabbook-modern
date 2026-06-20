import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


class CheckFailure(Exception):
    pass


def ok(message: str) -> None:
    print(f"[OK] {message}")


def fail(message: str) -> None:
    print(f"[FAIL] {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CheckFailure(message)


def run(command: list[str], cwd: Path) -> None:
    executable = shutil.which(command[0])
    require(executable is not None, f"Executable not found: {command[0]}")
    result = subprocess.run([executable, *command[1:]], cwd=cwd, text=True)
    require(result.returncode == 0, f"Command failed: {' '.join(command)}")


def load_cloud_config():
    cloud_dir = REPO_ROOT / "cloud_server"
    sys.path.insert(0, str(cloud_dir))
    try:
        spec = importlib.util.spec_from_file_location("release_cloud_config", cloud_dir / "config.py")
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(cloud_dir))


def check_cloud_production_guards() -> None:
    config = load_cloud_config()

    try:
        config.Settings(ENVIRONMENT="production").validate_runtime()
    except RuntimeError as exc:
        message = str(exc)
        for expected in (
            "SECRET_KEY",
            "ADMIN_TOKEN",
            "ALIPAY_APP_ID",
            "ALIPAY_PRIVATE_KEY_PATH",
            "ALIPAY_PUBLIC_KEY_PATH",
            "ALIPAY_GATEWAY_URL",
            "ALIPAY_NOTIFY_URL",
        ):
            require(expected in message, f"Production config guard is missing {expected}")
        ok("Cloud production config rejects unsafe defaults")
        return

    raise CheckFailure("Cloud production config accepted unsafe defaults")


def check_signing_tooling() -> None:
    require((REPO_ROOT / "scripts" / "check_windows_signature.py").is_file(), "Windows signature check script is missing")
    require((REPO_ROOT / "scripts" / "sign_windows_installer.py").is_file(), "Windows signing script is missing")
    ok("Windows signing scripts are present")


def check_electron_package() -> None:
    package_json = json.loads((REPO_ROOT / "electron" / "package.json").read_text(encoding="utf-8"))
    resources = package_json.get("build", {}).get("extraResources", [])
    require(
        any(item.get("from") == "../backend/dist-release" and item.get("to") == "backend-dist" for item in resources),
        "Electron package must include backend/dist-release as backend-dist",
    )
    require((REPO_ROOT / "frontend" / "dist" / "index.html").is_file(), "frontend/dist/index.html is missing")
    require(
        (REPO_ROOT / "backend" / "dist-release" / "vocabbook-backend" / "vocabbook-backend.exe").is_file(),
        "Packaged backend executable is missing",
    )
    require(any((REPO_ROOT / "electron" / "dist").glob("*Setup*.exe")), "Windows installer is missing")
    ok("Electron release inputs and installer artifacts exist")


def check_gitignore_release_outputs() -> None:
    gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
    for pattern in (
        "frontend/dist/",
        "backend/build-release/",
        "backend/dist-release/",
        "backend/venv-build/",
        "electron/dist/",
        "tmp-release-smoke-data/",
    ):
        require(pattern in gitignore, f".gitignore must ignore {pattern}")
    ok("Generated release outputs are ignored")


def check_cloud_deploy_assets() -> None:
    deploy_bat = (REPO_ROOT / "deploy_cloud_server.bat").read_text(encoding="utf-8")
    remote_helper = (REPO_ROOT / "deploy_cloud_server_remote.sh").read_text(encoding="utf-8")
    require((REPO_ROOT / "scripts" / "cloud_deploy_check.py").is_file(), "Cloud deployment check script is missing")
    require("scripts\\cloud_deploy_check.py" in deploy_bat, "Cloud deploy package must include cloud_deploy_check.py")
    require("cloud_deploy_check.py" in remote_helper, "Remote deploy helper must run cloud_deploy_check.py")
    for expected in ("BACKUP_DIR", "rollback()", "trap 'rollback; cleanup' EXIT", "KEEP_BACKUPS", "journalctl", "DEPLOY_ADMIN_TOKEN"):
        require(expected in remote_helper, f"Remote deploy helper is missing rollback guard: {expected}")
    ok("Cloud deployment smoke check and rollback are packaged and invoked")


def main() -> int:
    checks = (
        check_cloud_production_guards,
        check_gitignore_release_outputs,
        check_cloud_deploy_assets,
        check_signing_tooling,
        check_electron_package,
        lambda: run([sys.executable, "scripts/generate_release_manifest.py", "--check"], REPO_ROOT),
        lambda: run([sys.executable, "scripts/generate_release_notes.py", "--check"], REPO_ROOT),
        lambda: run([sys.executable, "scripts/check_windows_signature.py"], REPO_ROOT),
        lambda: run([sys.executable, "scripts/test_cloud_deploy_rollback.py"], REPO_ROOT),
        lambda: run(["npm", "run", "release:check"], REPO_ROOT / "electron"),
    )

    failures = 0
    for check in checks:
        try:
            check()
        except Exception as exc:
            failures += 1
            fail(str(exc))

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
