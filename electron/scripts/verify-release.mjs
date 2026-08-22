import fs from 'node:fs';
import path from 'node:path';
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
