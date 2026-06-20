import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = REPO_ROOT / "tmp-cloud-rollback-test"
APP_DIR = TMP_DIR / "app"
BIN_DIR = TMP_DIR / "bin"
PKG_DIR = TMP_DIR / "pkg"
PACKAGE_PATH = TMP_DIR / "pkg.tar.gz"


def write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")
    path.chmod(0o755)


def find_shell() -> str | None:
    for name in ("sh", "bash"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in (
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\sh.exe",
    ):
        if Path(candidate).is_file():
            return candidate
    return None


def static_assertions() -> None:
    remote_helper = (REPO_ROOT / "deploy_cloud_server_remote.sh").read_text(encoding="utf-8")
    required = [
        "BACKUP_DIR=",
        "rollback()",
        "trap 'rollback; cleanup' EXIT",
        "DEPLOY_SUCCEEDED=1",
        "cp -rf \"${BACKUP_DIR}/${name}/.\"",
        "journalctl -u",
    ]
    missing = [item for item in required if item not in remote_helper]
    if missing:
        raise AssertionError(f"Missing rollback safeguards: {missing}")


def integration_test(shell: str) -> None:
    if TMP_DIR.exists():
        shutil.rmtree(TMP_DIR)
    (APP_DIR / "cloud_server").mkdir(parents=True)
    (APP_DIR / "deploy").mkdir()
    (APP_DIR / "scripts").mkdir()
    (APP_DIR / "docs").mkdir()
    (APP_DIR / ".venv" / "bin").mkdir(parents=True)
    (BIN_DIR).mkdir(parents=True)
    (PKG_DIR / "cloud_server").mkdir(parents=True)
    (PKG_DIR / "scripts").mkdir()

    (APP_DIR / "cloud_server" / "version.txt").write_text("old-version\n", encoding="utf-8")
    (PKG_DIR / "cloud_server" / "version.txt").write_text("new-version\n", encoding="utf-8")
    (PKG_DIR / "scripts" / "cloud_deploy_check.py").write_text("print('new check')\n", encoding="utf-8")
    write_executable(APP_DIR / ".venv" / "bin" / "pip", "#!/bin/sh\nexit 0\n")
    write_executable(APP_DIR / ".venv" / "bin" / "python", "#!/bin/sh\nexit 1\n")
    write_executable(BIN_DIR / "systemctl", "#!/bin/sh\nexit 0\n")
    write_executable(BIN_DIR / "journalctl", "#!/bin/sh\nexit 0\n")

    with tarfile.open(PACKAGE_PATH, "w:gz") as archive:
        for child in PKG_DIR.iterdir():
            archive.add(child, arcname=child.name)

    env = os.environ.copy()
    env["PATH"] = str(BIN_DIR) + os.pathsep + env.get("PATH", "")
    env["KEEP_BACKUPS"] = "2"
    result = subprocess.run(
        [shell, str(REPO_ROOT / "deploy_cloud_server_remote.sh"), str(APP_DIR), "vocabbook-cloud", str(PACKAGE_PATH)],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode == 0:
        raise AssertionError(f"Expected failed deploy, got success\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")

    restored = (APP_DIR / "cloud_server" / "version.txt").read_text(encoding="utf-8")
    if restored != "old-version\n":
        raise AssertionError(f"Rollback did not restore old version, got {restored!r}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    if not (APP_DIR / "deploy_backups").is_dir():
        raise AssertionError("Backup directory was not created")


def main() -> int:
    static_assertions()
    shell = find_shell()
    if os.name != "nt" and shell:
        integration_test(shell)
        print("[OK] Remote deploy rollback restores previous version after failed health check")
    else:
        print("[OK] Remote deploy rollback static guards are present; shell integration skipped on this host")
    if TMP_DIR.exists():
        def _make_writable(_func, path, _exc_info):
            try:
                Path(path).chmod(0o700)
            except OSError:
                pass
            try:
                _func(path)
            except OSError:
                pass
        shutil.rmtree(TMP_DIR, onerror=_make_writable)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
