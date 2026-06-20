import argparse
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "electron" / "dist"
MANIFEST_PATH = DIST_DIR / "release-manifest.json"


def load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        raise FileNotFoundError(f"Missing release manifest: {MANIFEST_PATH}")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def release_notes_path(manifest: dict) -> Path:
    return DIST_DIR / f"release-notes-v{manifest['version']}.md"


def render_notes(manifest: dict) -> str:
    artifacts = manifest.get("artifacts") or []
    installer = next((artifact for artifact in artifacts if artifact["name"].endswith(".exe") and "Setup" in artifact["name"]), None)
    if installer is None:
        raise RuntimeError("Manifest does not include a Windows installer")

    artifact_lines = []
    for artifact in artifacts:
        artifact_lines.append(
            f"| `{artifact['name']}` | {artifact['size_bytes']} | `{artifact['sha256']}` |"
        )

    return rf"""# {manifest['product']} v{manifest['version']}

App ID: `{manifest['app_id']}`
Generated at: `{manifest['generated_at']}`

## Download

Upload these files to the GitHub Release:

| File | Size bytes | SHA256 |
| --- | ---: | --- |
{chr(10).join(artifact_lines)}

Primary installer SHA256:

```text
{installer['sha256']}  {installer['name']}
```

## Release Checks

Sign the Windows installer after `npm run dist:win` and before publishing:

```powershell
$env:WINDOWS_CERT_PASSWORD = "<certificate-password>"
.\.venv-win\Scripts\python scripts\sign_windows_installer.py --cert <path-to-certificate.pfx>
```

Run these checks before marking the release public:

```powershell
.\.venv-win\Scripts\python scripts\generate_release_manifest.py --check
.\.venv-win\Scripts\python scripts\release_readiness.py
.\.venv-win\Scripts\python -m pytest backend\tests cloud_server\tests -q
```

Cloud production smoke check after deployment:

```bash
python scripts/cloud_deploy_check.py --base-url https://api.historyai.fun --expect-production --admin-token "$ADMIN_TOKEN"
```

Payment live drill after Alipay production credentials are deployed:

```bash
python scripts/payment_live_drill.py \
  --base-url https://api.historyai.fun \
  --email <test-account-email> \
  --password <test-account-password> \
  --admin-token "$ADMIN_TOKEN"
```

## Known Release Requirements

- Sign the Windows installer before public distribution; `check_windows_signature.py --require-signed` must pass.
- Publish `latest.yml` and the `.blockmap` with the installer so auto-update metadata stays consistent.
- Keep GitHub token, Windows signing certificate, certificate password, Alipay keys and admin token outside the repository.
"""


def verify_notes(manifest: dict, notes: str) -> None:
    if f"v{manifest['version']}" not in notes:
        raise RuntimeError("Release notes do not include the manifest version")
    for artifact in manifest.get("artifacts") or []:
        if artifact["name"] not in notes:
            raise RuntimeError(f"Release notes missing artifact name: {artifact['name']}")
        if artifact["sha256"] not in notes:
            raise RuntimeError(f"Release notes missing artifact SHA256: {artifact['name']}")
    for expected in ("release_readiness.py", "cloud_deploy_check.py", "payment_live_drill.py", "check_windows_signature.py --require-signed", "sign_windows_installer.py"):
        if expected not in notes:
            raise RuntimeError(f"Release notes missing validation command: {expected}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate or verify GitHub release notes from release-manifest.json")
    parser.add_argument("--check", action="store_true", help="Verify existing notes instead of writing them")
    args = parser.parse_args()

    manifest = load_manifest()
    path = release_notes_path(manifest)
    if args.check:
        if not path.is_file():
            raise SystemExit(f"Missing release notes: {path}")
        verify_notes(manifest, path.read_text(encoding="utf-8"))
        print(f"[OK] Release notes match manifest: {path}")
        return 0

    notes = render_notes(manifest)
    verify_notes(manifest, notes)
    path.write_text(notes, encoding="utf-8")
    print(f"[OK] Wrote release notes: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
