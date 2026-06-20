# Electron Release Checklist

Use this checklist before publishing a Windows installer.

## 1. Build Inputs

```bat
cd frontend
npm run build

cd ..\electron
npm run release:check

cd ..
.\.venv-win\Scripts\python scripts\release_readiness.py
```

The release check verifies that:

- production DevTools are gated behind development mode
- renderer isolation remains enabled
- external links cannot navigate the app window directly
- tray navigation uses IPC instead of script injection
- electron-builder still packages `frontend/dist` and `backend/dist-release` as `backend-dist`
- the Windows NSIS target is configured

The repository readiness check additionally verifies that:

- cloud production config rejects unsafe defaults
- generated release outputs are ignored by Git
- frontend, backend and installer artifacts exist
- `release-manifest.json` matches installer hashes and sizes
- release notes include every artifact and SHA256 from the manifest

## 2. Backend Bundle

Build the local backend executable before running `electron-builder`:

```bat
cd ..\backend
pyinstaller --clean vocabbook-backend.spec
```

The final Electron package expects:

```text
backend/dist-release/vocabbook-backend/vocabbook-backend.exe
```

## 3. Installer

```bat
cd ..\electron
npm run dist:win

cd ..
.\.venv-win\Scripts\python scripts\generate_release_manifest.py
.\.venv-win\Scripts\python scripts\generate_release_notes.py
```

Expected output:

```text
electron/dist/*.exe
electron/dist/latest.yml
electron/dist/release-manifest.json
electron/dist/release-notes-v*.md
```

Before publishing, verify the manifest and release notes against the generated files:

```bat
.\.venv-win\Scripts\python scripts\generate_release_manifest.py --check
.\.venv-win\Scripts\python scripts\generate_release_notes.py --check
```

## 4. Manual Smoke Test

Install the generated `.exe`, then verify:

- app opens without a console window
- local backend starts and `/health` is reachable through the app flow
- login reaches `https://api.historyai.fun`
- subscription modal creates a real order and shows a QR code
- the View menu does not show DevTools in the installed build
- global shortcut can be changed and persists after restart
- update check reports a sensible status instead of crashing

## 5. Signing And Publishing

For public distribution, sign the installer before publishing. Unsigned Windows installers are likely to trigger SmartScreen warnings.

Sign the installer with a `.pfx` certificate, then regenerate manifest and release notes:

```bat
set WINDOWS_CERT_PASSWORD=你的证书密码
.\.venv-win\Scripts\python scripts\sign_windows_installer.py --cert C:\secure\codesign.pfx
```

The signing script runs `signtool`, verifies the signature, then refreshes `release-manifest.json` and release notes so SHA256 values match the signed installer.

Check the current signature state:

```bat
.\.venv-win\Scripts\python scripts\check_windows_signature.py
```

Before marking a GitHub Release public, the strict check must pass:

```bat
.\.venv-win\Scripts\python scripts\check_windows_signature.py --require-signed
```

Keep these release secrets outside the repository:

- GitHub publishing token
- Windows code-signing certificate
- certificate password
