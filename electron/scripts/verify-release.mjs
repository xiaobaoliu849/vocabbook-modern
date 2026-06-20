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
  'Electron package includes frontend and backend resources',
  Array.isArray(packageJson.build?.files)
    && packageJson.build.files.includes('../frontend/dist/**/*')
    && Array.isArray(packageJson.build?.extraResources)
    && packageJson.build.extraResources.some((item) => item.from === '../backend/dist-release' && item.to === 'backend-dist'),
  'electron-builder must package frontend/dist and the compiled backend.'
);

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
