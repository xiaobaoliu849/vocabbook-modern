import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "electron" / "dist"
MANIFEST_PATH = DIST_DIR / "release-manifest.json"
LATEST_YML_PATH = DIST_DIR / "latest.yml"
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


def _signed_file_hashes(installer: Path) -> tuple[str, int]:
    digest = hashlib.sha512(installer.read_bytes()).digest()
    return base64.b64encode(digest).decode("ascii"), installer.stat().st_size


def rewrite_latest_yml(yml_path: Path, installer_name: str, sha512_b64: str, size: int) -> bool:
    """Point latest.yml's hashes/sizes at the signed binary.

    Signing rewrites every byte of the installer, but electron-updater
    verifies downloads against the sha512/size recorded at build time —
    leaving them stale makes EVERY client auto-update fail with a checksum
    mismatch. The *.blockmap cannot be regenerated outside electron-builder,
    so it (and its files entry) is dropped instead of left stale; clients
    degrade to a full download for that one release.

    Line-based transform on purpose: avoids a PyYAML dependency in the
    release environment and preserves electron-builder's formatting.
    """
    try:
        lines = yml_path.read_text(encoding="utf-8").splitlines(keepends=True)
    except FileNotFoundError:
        return False

    out: list[str] = []
    skipping_blockmap_entry = False
    in_matching_files_entry = False
    changed = False

    for line in lines:
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()

        if stripped.startswith("- url:") or stripped.startswith("-   url:") or re.match(r"-\s*url:", stripped):
            url_value = stripped.split(":", 1)[1].strip()
            in_matching_files_entry = url_value == installer_name
            skipping_blockmap_entry = url_value.endswith(".blockmap")
            if skipping_blockmap_entry:
                changed = True
                continue
        elif indent == 0 and ":" in stripped:
            # A new top-level key ends any files-entry context.
            in_matching_files_entry = False
            skipping_blockmap_entry = False
        elif skipping_blockmap_entry and indent == 0:
            skipping_blockmap_entry = False

        if skipping_blockmap_entry:
            # Continuation of the blockmap's own sha512/size entry.
            continue

        if stripped.startswith("sha512:") and (in_matching_files_entry or indent == 0):
            new_line = re.sub(r"sha512:\s*\S.*", f"sha512: {sha512_b64}", line, count=1)
            if new_line != line:
                changed = True
            out.append(new_line)
            continue
        if stripped.startswith("size:") and in_matching_files_entry:
            new_line = re.sub(r"size:\s*\d+\s*$", f"size: {size}\n" if line.endswith("\n") else f"size: {size}", line, count=1)
            if new_line != line:
                changed = True
            out.append(new_line)
            continue

        out.append(line)

    if not changed:
        return False

    yml_path.write_text("".join(out), encoding="utf-8")
    return True


def verify_latest_yml(yml_path: Path, installer_name: str, expected_sha512_b64: str) -> None:
    """Fail loudly if any surviving hash for the installer is stale."""
    text = yml_path.read_text(encoding="utf-8")
    current_url_matches = False
    checked = 0
    for line in text.splitlines():
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()
        if re.match(r"-\s*url:", stripped):
            current_url_matches = stripped.split(":", 1)[1].strip() == installer_name
        elif indent == 0 and ":" in stripped:
            current_url_matches = False
            if stripped.startswith("sha512:") and stripped != f"sha512: {expected_sha512_b64}":
                raise RuntimeError(f"{yml_path.name}: stale top-level sha512 after signing")
        if current_url_matches and stripped.startswith("sha512:"):
            if stripped != f"sha512: {expected_sha512_b64}":
                raise RuntimeError(f"{yml_path.name}: stale sha512 for {installer_name}")
            checked += 1
    if checked == 0:
        raise RuntimeError(f"{yml_path.name}: no sha512 found for {installer_name}")


def drop_stale_blockmaps(dist_dir: Path) -> None:
    for blockmap in dist_dir.glob("*.blockmap"):
        blockmap.unlink()
        print(f"[..] Removed stale blockmap (regenerate via electron-builder if differential updates are needed): {blockmap.name}")


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

    # electron-updater metadata must match the SIGNED bytes or every client
    # auto-update fails checksum verification.
    sha512_b64, size = _signed_file_hashes(installer)
    if rewrite_latest_yml(LATEST_YML_PATH, installer.name, sha512_b64, size):
        drop_stale_blockmaps(DIST_DIR)
        verify_latest_yml(LATEST_YML_PATH, installer.name, sha512_b64)
        print(f"[OK] latest.yml rewritten for signed installer: {installer.name}")
    else:
        print(f"[..] No latest.yml to update at {LATEST_YML_PATH} (dir builds don't publish one)")

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
