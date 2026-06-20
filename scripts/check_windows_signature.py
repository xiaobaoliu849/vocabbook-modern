import argparse
import base64
import json
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "electron" / "dist"
MANIFEST_PATH = DIST_DIR / "release-manifest.json"


def load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        raise FileNotFoundError(f"Missing release manifest: {MANIFEST_PATH}")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def installer_path() -> Path:
    manifest = load_manifest()
    for artifact in manifest.get("artifacts") or []:
        name = artifact.get("name", "")
        if name.endswith(".exe") and "Setup" in name:
            return DIST_DIR / name
    raise RuntimeError("Manifest does not include a Windows installer")


def powershell_executable() -> str | None:
    return shutil.which("pwsh") or shutil.which("powershell")


def authenticode_status(path: Path) -> str:
    shell = powershell_executable()
    if shell is None:
        return "UnknownNoPowerShell"
    ps_path = str(path).replace("'", "''")
    command = f"$sig = Get-AuthenticodeSignature -LiteralPath '{ps_path}'; $sig.Status.ToString()"
    encoded = base64.b64encode(command.encode("utf-16le")).decode("ascii")
    result = subprocess.run(
        [shell, "-NoProfile", "-EncodedCommand", encoded],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        return "UnknownSignatureCheckFailed"
    return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "UnknownEmptyStatus"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check the Windows installer Authenticode signature")
    parser.add_argument("--require-signed", action="store_true", help="Fail unless the installer has a valid signature")
    args = parser.parse_args()

    path = installer_path()
    if not path.is_file():
        print(f"[FAIL] Installer is missing: {path}")
        return 1

    status = authenticode_status(path)
    if status == "Valid":
        print(f"[OK] Installer signature is valid: {path.name}")
        return 0

    message = f"Installer signature status is {status}: {path.name}"
    if args.require_signed:
        print(f"[FAIL] {message}")
        return 1
    print(f"[WARN] {message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
