import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "electron" / "dist"
MANIFEST_PATH = DIST_DIR / "release-manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def collect_artifacts() -> list[dict]:
    required_patterns = ("*Setup*.exe", "*.blockmap", "latest.yml")
    artifacts: list[Path] = []
    for pattern in required_patterns:
        matches = sorted(DIST_DIR.glob(pattern))
        if not matches:
            raise FileNotFoundError(f"Missing release artifact matching {pattern}")
        artifacts.extend(matches)

    unique = []
    seen = set()
    for path in artifacts:
        if path.name in seen:
            continue
        seen.add(path.name)
        unique.append(path)

    return [
        {
            "name": path.name,
            "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for path in unique
    ]


def build_manifest() -> dict:
    package_json = load_json(REPO_ROOT / "electron" / "package.json")
    return {
        "product": package_json.get("build", {}).get("productName"),
        "app_id": package_json.get("build", {}).get("appId"),
        "version": package_json.get("version"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "artifacts": collect_artifacts(),
    }


def verify_manifest(manifest: dict) -> None:
    package_json = load_json(REPO_ROOT / "electron" / "package.json")
    if manifest.get("version") != package_json.get("version"):
        raise RuntimeError(f"Manifest version {manifest.get('version')} does not match package version {package_json.get('version')}")

    artifacts = manifest.get("artifacts") or []
    if not artifacts:
        raise RuntimeError("Manifest does not list artifacts")

    names = {artifact.get("name") for artifact in artifacts}
    if not any(name and name.endswith(".exe") and "Setup" in name for name in names):
        raise RuntimeError("Manifest does not include the Windows installer")
    if "latest.yml" not in names:
        raise RuntimeError("Manifest does not include latest.yml")

    for artifact in artifacts:
        path = DIST_DIR / artifact["name"]
        if not path.is_file():
            raise RuntimeError(f"Manifest artifact is missing: {path}")
        actual_size = path.stat().st_size
        actual_sha = sha256_file(path)
        if artifact.get("size_bytes") != actual_size:
            raise RuntimeError(f"Size mismatch for {path.name}: manifest={artifact.get('size_bytes')} actual={actual_size}")
        if artifact.get("sha256") != actual_sha:
            raise RuntimeError(f"SHA256 mismatch for {path.name}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate or verify the Electron release manifest")
    parser.add_argument("--check", action="store_true", help="Verify existing manifest instead of writing it")
    args = parser.parse_args()

    if args.check:
        if not MANIFEST_PATH.is_file():
            raise SystemExit(f"Missing release manifest: {MANIFEST_PATH}")
        verify_manifest(load_json(MANIFEST_PATH))
        print(f"[OK] Release manifest matches artifacts: {MANIFEST_PATH}")
        return 0

    manifest = build_manifest()
    verify_manifest(manifest)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] Wrote release manifest: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
