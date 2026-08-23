import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const electronDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(electronDir, '..');

const checks = [];

function addCheck(name, pass, detail) {
  checks.push({ name, pass, detail });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const packageJson = JSON.parse(readText(path.join(electronDir, 'package.json')));
const mainJs = readText(path.join(electronDir, 'main.js'));
const preloadJs = readText(path.join(electronDir, 'preload.js'));

addCheck(
  'Production menu gates DevTools behind DEV_MODE',
  mainJs.includes('toggleDevTools') && mainJs.includes('...(DEV_MODE ? ['),
  'toggleDevTools should exist only inside the DEV_MODE view submenu.'
);

addCheck(
  'Renderer isolation is enabled',
  mainJs.includes('nodeIntegration: false') && mainJs.includes('contextIsolation: true'),
  'Electron renderer must not expose Node.js directly.'
);

addCheck(
  'External navigation is intercepted',
  mainJs.includes('setWindowOpenHandler') && mainJs.includes("will-navigate") && mainJs.includes('openAllowedExternalUrl'),
  'External links should not navigate the app window directly.'
);

addCheck(
  'Tray navigation uses IPC instead of script injection',
  !mainJs.includes('executeJavaScript') && preloadJs.includes("ipcRenderer.on('navigate-to'"),
  'Avoid executeJavaScript for internal navigation.'
);

addCheck(
  'Backend child process is hidden on Windows',
  mainJs.includes('windowsHide: true') && mainJs.includes('resolvePackagedBackendPath'),
  'The bundled backend should not open a console window and packaged path resolution should support onedir builds.'
);

addCheck(
  'Electron package config ships frontend via extraResources',
  Array.isArray(packageJson.build?.files)
    && packageJson.build.files.includes('main.js')
    && packageJson.build.files.includes('preload.js')
    && !packageJson.build.files.some((pattern) => pattern.includes('..'))
    && Array.isArray(packageJson.build?.extraResources)
    && packageJson.build.extraResources.some((item) => item.from === '../frontend/dist' && item.to === 'frontend-dist')
    && packageJson.build.extraResources.some((item) => item.from === '../backend/dist-release' && item.to === 'backend-dist'),
  // Parent-dir globs inside build.files match nothing (globs resolve relative to
  // electron/), which silently produced a frontend-less 2.0.0 asar. Frontend
  // must ship through extraResources like the backend does.
  'build.files must stay within electron/, and frontend/dist must ship via extraResources -> frontend-dist.'
);

// Hard artifact check: extraResources are copied as plain files under
// dist/win-unpacked/resources, so their presence can be verified directly
// without parsing the asar.
const resourcesDir = path.join(electronDir, 'dist', 'win-unpacked', 'resources');
if (fs.existsSync(resourcesDir)) {
  const packagedFrontendIndex = path.join(resourcesDir, 'frontend-dist', 'index.html');
  addCheck(
    'Packaged output contains frontend-dist/index.html',
    fs.existsSync(packagedFrontendIndex),
    'dist/win-unpacked/resources/frontend-dist/index.html is missing - the installer would ship a blank window. Rebuild with `npm run pack` after `npm run build` in frontend.'
  );

  const backendDistDir = path.join(resourcesDir, 'backend-dist');
  const backendDistHasFiles = fs.existsSync(backendDistDir)
    && fs.readdirSync(backendDistDir).length > 0;
  addCheck(
    'Packaged output contains backend-dist binaries',
    backendDistHasFiles,
    'dist/win-unpacked/resources/backend-dist is empty or missing. Run the PyInstaller step of build.bat before packaging.'
  );
} else {
  console.log('[SKIP] Packaged-output checks (no dist/win-unpacked yet - run `npm run pack` to populate)');
}

addCheck(
  'Windows installer target is configured',
  packageJson.build?.win?.target?.some((target) => target.target === 'nsis'),
  'Windows release should build an NSIS installer.'
);

// --- Content-level release checks -------------------------------------------
// Existence checks alone shipped broken artifacts before (a latest.yml naming
// a file that does not exist, a stale packaged frontend). These compare bytes.

function hashFile(filePath, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest();
}

const sourceDistDir = path.join(repoRoot, 'frontend', 'dist');
const packagedFrontendDir = path.join(resourcesDir, 'frontend-dist');
if (fs.existsSync(resourcesDir) && fs.existsSync(sourceDistDir) && fs.existsSync(packagedFrontendDir)) {
  const mismatches = [];
  let compared = 0;
  const walk = (dir, relBase = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absPath = path.join(dir, entry.name);
      const relPath = path.join(relBase, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else {
        compared += 1;
        const packagedPath = path.join(packagedFrontendDir, relPath);
        if (!fs.existsSync(packagedPath) || !hashFile(absPath).equals(hashFile(packagedPath))) {
          mismatches.push(relPath);
        }
      }
    }
  };
  walk(sourceDistDir);
  addCheck(
    'Packaged frontend-dist matches source dist byte-for-byte',
    compared > 0 && mismatches.length === 0,
    compared === 0
      ? 'No files compared - source dist is empty?'
      : `Stale/mismatched packaged files (rebuild the Electron app): ${mismatches.slice(0, 5).join(', ')}`
  );
} else if (!fs.existsSync(resourcesDir)) {
  console.log('[SKIP] frontend-dist byte-compare (no dist/win-unpacked yet)');
}

const distDir = path.join(electronDir, 'dist');
const latestYmlPath = path.join(distDir, 'latest.yml');
if (fs.existsSync(latestYmlPath)) {
  const yml = readText(latestYmlPath);
  // Artifact names contain spaces (e.g. "智能生词本 Setup 2.0.0.exe"), so
  // capture the rest of the line instead of \S+, trimming trailing whitespace.
  const fileRef = yml.match(/^file:\s*(.+?)\s*$/m)?.[1]
    ?? yml.match(/^path:\s*(.+?)\s*$/m)?.[1];
  const sha512B64 = yml.match(/^sha512:\s*([A-Za-z0-9+/=]+)\s*$/m)?.[1];
  // electron-builder v26 writes size only inside the files[] entry (indented),
  // not at the top level, so fall back to the size of the entry that names
  // the installer.
  const size = yml.match(/^size:\s*(\d+)\s*$/m)?.[1]
    ?? (() => {
      let inInstallerEntry = false;
      for (const line of yml.split(/\r?\n/)) {
        const stripped = line.trim();
        const indent = line.length - line.trimStart().length;
        if (stripped.startsWith('- url:')) {
          inInstallerEntry = fileRef !== null && stripped.slice('- url:'.length).trim() === fileRef;
        } else if (inInstallerEntry && indent === 0 && stripped.endsWith(':')) {
          inInstallerEntry = false;
        } else if (inInstallerEntry && stripped.startsWith('size:')) {
          return stripped.match(/^size:\s*(\d+)/)?.[1];
        }
      }
      return undefined;
    })();

  const installerPath = fileRef ? path.join(distDir, fileRef) : null;
  addCheck(
    'latest.yml references an existing installer file',
    Boolean(installerPath && fs.existsSync(installerPath)),
    `latest.yml names "${fileRef ?? '?'}" but that file is not in electron/dist - rebuild or re-run the signing step.`
  );

  if (installerPath && fs.existsSync(installerPath)) {
    const actualSha512 = hashFile(installerPath, 'sha512').toString('base64');
    const actualSize = fs.statSync(installerPath).size;
    addCheck(
      'latest.yml sha512 matches the installer on disk',
      Boolean(sha512B64) && sha512B64 === actualSha512,
      'latest.yml sha512 is stale - electron-updater would reject every download. Re-run scripts/sign_windows_installer.py.'
    );
    addCheck(
      'latest.yml size matches the installer on disk',
      Boolean(size) && Number(size) === actualSize,
      `latest.yml says ${size} bytes but the file is ${actualSize} - update manifest is stale.`
    );
  }
} else {
  console.log('[SKIP] latest.yml checks (no dist/latest.yml yet)');
}


const frontendDistIndex = path.join(repoRoot, 'frontend', 'dist', 'index.html');
addCheck(
  'Frontend production build exists',
  fs.existsSync(frontendDistIndex),
  'Run npm run build in frontend before packaging.'
);

const failed = checks.filter((check) => !check.pass);
for (const check of checks) {
  const marker = check.pass ? 'OK' : 'FAIL';
  console.log(`[${marker}] ${check.name}`);
  if (!check.pass) {
    console.log(`  ${check.detail}`);
  }
}

if (failed.length > 0) {
  process.exit(1);
}
