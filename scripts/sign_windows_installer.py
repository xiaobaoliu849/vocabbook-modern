import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "electron" / "dist"
MANIFEST_PATH = DIST_DIR / "release-manifest.json"
DEFAULT_TIMESTAMP_URL = "http://timestamp.digicert.com"


def load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        raise FileNotFoundError(f"Missing release manifest: {MANIFEST_PATH}")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def installer_path() -> Path:
    manifest = load_manifest()
    for artifact in manifest.get("artifacts") or []:
        name = artifact.get("name", "")
        if name.endswith(".exe") and "Setup" in name:
            path = DIST_DIR / name
            if not path.is_file():
                raise FileNotFoundError(f"Installer from manifest is missing: {path}")
            return path
    raise RuntimeError("Manifest does not include a Windows installer")


def find_signtool(explicit_path: str | None = None) -> str:
    candidates = []
    if explicit_path:
        candidates.append(Path(explicit_path))
    found = shutil.which("signtool")
    if found:
        candidates.append(Path(found))
    program_files_x86 = os.environ.get("ProgramFiles(x86)")
    if program_files_x86:
        kits_root = Path(program_files_x86) / "Windows Kits" / "10" / "bin"
        if kits_root.is_dir():
            candidates.extend(sorted(kits_root.glob("*/*/signtool.exe"), reverse=True))

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise FileNotFoundError("signtool.exe was not found. Install Windows SDK or pass --signtool-path.")


def run(command: list[str], cwd: Path = REPO_ROOT) -> None:
    result = subprocess.run(command, cwd=cwd, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(command)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sign the Windows installer and refresh release metadata")
    parser.add_argument("--cert", required=True, help="Path to a code-signing certificate .pfx")
    parser.add_argument("--password-env", default="WINDOWS_CERT_PASSWORD", help="Environment variable containing the .pfx password")
    parser.add_argument("--timestamp-url", default=DEFAULT_TIMESTAMP_URL, help="RFC3161 timestamp server URL")
    parser.add_argument("--signtool-path", default=None, help="Optional explicit path to signtool.exe")
    args = parser.parse_args()

    cert_path = Path(args.cert)
    if not cert_path.is_file():
        print(f"[FAIL] Certificate file is missing: {cert_path}")
        return 1

    password = os.environ.get(args.password_env)
    if not password:
        print(f"[FAIL] Certificate password env var is not set: {args.password_env}")
        return 1

    signtool = find_signtool(args.signtool_path)
    installer = installer_path()
    command = [
        signtool,
        "sign",
        "/f",
        str(cert_path),
        "/p",
        password,
        "/fd",
        "SHA256",
        "/tr",
        args.timestamp_url,
        "/td",
        "SHA256",
        str(installer),
    ]

    run(command)
    run([sys.executable, "scripts/check_windows_signature.py", "--require-signed"])
    run([sys.executable, "scripts/generate_release_manifest.py"])
    run([sys.executable, "scripts/generate_release_notes.py"])
    run([sys.executable, "scripts/generate_release_manifest.py", "--check"])
    run([sys.executable, "scripts/generate_release_notes.py", "--check"])
    print(f"[OK] Signed installer and refreshed release metadata: {installer.name}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1)
