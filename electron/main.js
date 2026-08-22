const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { autoUpdater } = require('electron-updater')

let mainWindow = null
let tray = null
let backendProcess = null

// Configuration
const DEV_MODE = process.env.NODE_ENV === 'development'
// Production frontend ships via extraResources (see package.json build
// .extraResources) into <resources>/frontend-dist. A "../frontend/dist" files
// glob does NOT work: electron-builder resolves globs relative to the app
// directory, so parent-dir patterns match nothing and the packaged asar ends
// up without any frontend (the 2.0.0 release shipped exactly that way).
const FRONTEND_URL = DEV_MODE
    ? 'http://localhost:5173'
    : `file://${path.join(process.resourcesPath, 'frontend-dist', 'index.html')}`
const MAX_FRONTEND_LOAD_RETRIES = 2
const BACKEND_PATH = path.join(__dirname, '../backend')
const DEFAULT_GLOBAL_SHORTCUT = 'Ctrl+Alt+KeyV'
const BACKEND_HEALTH_URL = 'http://127.0.0.1:8000/health'
const HEALTH_POLL_INTERVAL_MS = 500
const HEALTH_TIMEOUT_MS = 30000
const ALLOWED_EXTERNAL_ORIGINS = new Set([
    'https://github.com',
    'https://console.evermind.ai'
])

let shortcutSettings = {
    globalToggleWindow: DEFAULT_GLOBAL_SHORTCUT
}

function getShortcutSettingsPath() {
    return path.join(app.getPath('userData'), 'shortcut-settings.json')
}

function normalizeFrontendShortcutBinding(binding) {
    if (!binding || typeof binding !== 'string') {
        return null
    }

    const tokens = binding
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean)

    if (tokens.length === 0) {
        return null
    }

    const modifiers = new Set()
    let keyToken = null

    for (const token of tokens) {
        if (token === 'Ctrl' || token === 'Meta' || token === 'Alt' || token === 'Shift') {
            modifiers.add(token)
            continue
        }

        keyToken = token
    }

    if (!keyToken) {
        return null
    }

    const orderedModifiers = ['Ctrl', 'Meta', 'Alt', 'Shift'].filter((token) => modifiers.has(token))
    return [...orderedModifiers, keyToken].join('+')
}

function keyTokenToAccelerator(token) {
    if (/^Key[A-Z]$/.test(token)) return token.slice(3)
    if (/^Digit[0-9]$/.test(token)) return token.slice(5)

    const acceleratorMap = {
        Enter: 'Enter',
        Escape: 'Esc',
        Tab: 'Tab',
        Space: 'Space',
        Delete: 'Delete',
        Backspace: 'Backspace',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        Slash: '/',
        Backslash: '\\',
        BracketLeft: '[',
        BracketRight: ']',
        Semicolon: ';',
        Quote: '\'',
        Comma: ',',
        Period: '.',
        Minus: '-',
        Equal: '=',
        Backquote: '`',
    }

    return acceleratorMap[token] || null
}

function frontendBindingToAccelerator(binding) {
    const normalized = normalizeFrontendShortcutBinding(binding)
    if (!normalized) {
        return null
    }

    const tokens = normalized.split('+')
    const modifiers = []
    let key = null

    for (const token of tokens) {
        if (token === 'Ctrl') {
            modifiers.push('CommandOrControl')
            continue
        }
        if (token === 'Meta') {
            modifiers.push(process.platform === 'darwin' ? 'Command' : 'Super')
            continue
        }
        if (token === 'Alt') {
            modifiers.push('Alt')
            continue
        }
        if (token === 'Shift') {
            modifiers.push('Shift')
            continue
        }

        key = keyTokenToAccelerator(token)
    }

    if (!key) {
        return null
    }

    return [...modifiers, key].join('+')
}

function loadShortcutSettings() {
    try {
        const settingsPath = getShortcutSettingsPath()
        if (!fs.existsSync(settingsPath)) {
            return { ...shortcutSettings }
        }

        const raw = fs.readFileSync(settingsPath, 'utf8')
        const parsed = JSON.parse(raw)
        const globalToggleWindow = normalizeFrontendShortcutBinding(parsed?.globalToggleWindow) || DEFAULT_GLOBAL_SHORTCUT

        return { globalToggleWindow }
    } catch (error) {
        console.error('Failed to load shortcut settings:', error)
        return { ...shortcutSettings }
    }
}

function saveShortcutSettings() {
    try {
        fs.writeFileSync(getShortcutSettingsPath(), JSON.stringify(shortcutSettings, null, 2))
    } catch (error) {
        console.error('Failed to save shortcut settings:', error)
    }
}

function toggleMainWindowVisibility() {
    if (!mainWindow) {
        return
    }

    if (mainWindow.isVisible()) {
        mainWindow.hide()
    } else {
        mainWindow.show()
        mainWindow.focus()
    }
}

function isAllowedExternalUrl(rawUrl) {
    try {
        const url = new URL(rawUrl)
        if (!['https:', 'mailto:'].includes(url.protocol)) {
            return false
        }
        if (url.protocol === 'mailto:') {
            return true
        }
        return ALLOWED_EXTERNAL_ORIGINS.has(url.origin)
    } catch (_error) {
        return false
    }
}

function isAppNavigationUrl(rawUrl) {
    try {
        const url = new URL(rawUrl)
        if (DEV_MODE) {
            return url.origin === 'http://localhost:5173' || url.origin === 'http://127.0.0.1:5173'
        }
        return url.protocol === 'file:'
    } catch (_error) {
        return false
    }
}

async function openAllowedExternalUrl(rawUrl) {
    if (!isAllowedExternalUrl(rawUrl)) {
        console.warn(`Blocked external URL: ${rawUrl}`)
        return
    }
    await shell.openExternal(rawUrl)
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'default',
        backgroundColor: '#0f172a',
        show: false
    })

    mainWindow.loadURL(FRONTEND_URL)

    // Production safety net: if the frontend bundle fails to load (missing
    // resources, broken install, AV interference), don't leave a permanently
    // invisible window. Wait for the backend, retry a bounded number of times,
    // then show an inline error page instead of nothing.
    let frontendLoadRetries = 0
    mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
        if (!isMainFrame || DEV_MODE || errorCode === -3 /* ERR_ABORTED */) return
        if (!mainWindow || mainWindow.isDestroyed()) return
        console.error(`Frontend load failed (${errorCode}): ${errorDescription}`)

        if (frontendLoadRetries >= MAX_FRONTEND_LOAD_RETRIES) {
            const errorHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
                `<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;` +
                `display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
                `<div style="text-align:center;max-width:32rem;padding:2rem">` +
                `<h1 style="font-size:1.5rem;margin-bottom:0.75rem">界面加载失败</h1>` +
                `<p style="color:#94a3b8">错误代码 ${errorCode}：${errorDescription || '未知错误'}</p>` +
                `<p style="color:#94a3b8">请尝试重启应用；若持续出现，请重新安装。</p>` +
                `</div></body></html>`
            try {
                await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml))
                if (!mainWindow.isVisible()) mainWindow.show()
            } catch (err) {
                console.error('Failed to show error page:', err)
            }
            return
        }

        frontendLoadRetries += 1
        try {
            await waitForBackendReady()
            if (mainWindow && !mainWindow.isDestroyed()) {
                await mainWindow.loadURL(FRONTEND_URL)
                if (!mainWindow.isVisible()) mainWindow.show()
            }
        } catch (err) {
            console.error('Frontend reload failed:', err)
        }
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void openAllowedExternalUrl(url)
        return { action: 'deny' }
    })

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (isAppNavigationUrl(url)) {
            return
        }
        event.preventDefault()
        void openAllowedExternalUrl(url)
    })

    // Show window when ready. In production the backend is spawned by this
    // process, so keep the window hidden until /health responds — otherwise the
    // first render races the server boot and errors out on the initial fetch.
    mainWindow.once('ready-to-show', () => {
        if (DEV_MODE) {
            mainWindow.show()
            return
        }
        waitForBackendReady().then(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show()
            }
        })
    })

    // Context Menu for Right Click
    mainWindow.webContents.on('context-menu', (event, params) => {
        const menuTemplate = [
            { role: 'cut', label: '剪切' },
            { role: 'copy', label: '复制' },
            { role: 'paste', label: '粘贴' },
            { type: 'separator' }
        ]

        if (params.selectionText && params.selectionText.trim().length > 0) {
            menuTemplate.unshift(
                {
                    label: `查询 "${params.selectionText.trim().length > 15 ? params.selectionText.trim().slice(0, 15) + '...' : params.selectionText.trim()}"`,
                    click: () => {
                        mainWindow.show()
                        mainWindow.focus()
                        mainWindow.webContents.send('trigger-search', params.selectionText.trim())
                    }
                },
                { type: 'separator' }
            )
        }

        const menu = Menu.buildFromTemplate(menuTemplate)
        menu.popup()
    })

    // Handle close to tray
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault()
            mainWindow.hide()
        }
    })

    // Open DevTools in development
    if (DEV_MODE) {
        // mainWindow.webContents.openDevTools()
    }
}

/**
 * Poll the backend /health endpoint until it reports healthy (or timeout).
 * Resolves true when the backend is ready, false if it never came up so the
 * window still opens (the frontend surfaces its own error states then).
 */
async function waitForBackendReady() {
    const startedAt = Date.now()
    while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
        try {
            const response = await fetch(BACKEND_HEALTH_URL, {
                signal: AbortSignal.timeout(2000)
            })
            if (response.ok) {
                const data = await response.json().catch(() => null)
                if (data && data.status === 'healthy') {
                    return true
                }
            }
        } catch (_error) {
            // Backend not reachable yet — keep polling
        }
        await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
    }
    console.warn('Backend health check timed out; showing window anyway')
    return false
}

function createTray() {
    // Use an empty native image so the OS default or no small window icon is shown
    const emptyIcon = nativeImage.createEmpty()
    tray = new Tray(emptyIcon)

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                mainWindow.show()
                mainWindow.focus()
            }
        },
        {
            label: '开始复习',
            click: () => {
                mainWindow.show()
                mainWindow.webContents.send('navigate-to', 'review')
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                app.isQuiting = true
                app.quit()
            }
        }
    ])

    tray.setToolTip('智能生词本')
    tray.setContextMenu(contextMenu)

    tray.on('double-click', () => {
        mainWindow.show()
        mainWindow.focus()
    })
}

function createApplicationMenu() {
    const isMac = process.platform === 'darwin'
    const viewSubmenu = [
        ...(DEV_MODE ? [
            { role: 'reload', label: '刷新' },
            { role: 'forceReload', label: '强制刷新' },
            { role: 'toggleDevTools', label: '开发者工具' },
            { type: 'separator' },
        ] : []),
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
    ]

    const template = [
        // { role: 'appMenu' }
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about', label: '关于 VocabBook' },
                { type: 'separator' },
                { role: 'services', label: '服务' },
                { type: 'separator' },
                { role: 'hide', label: '隐藏 VocabBook' },
                { role: 'hideOthers', label: '隐藏其他' },
                { role: 'unhide', label: '显示全部' },
                { type: 'separator' },
                { role: 'quit', label: '退出 VocabBook' }
            ]
        }] : []),
        // { role: 'fileMenu' }
        {
            label: '文件',
            submenu: [
                isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
            ]
        },
        // { role: 'editMenu' }
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                { role: 'delete', label: '删除' },
                { type: 'separator' },
                { role: 'selectAll', label: '全选' }
            ]
        },
        // { role: 'viewMenu' }
        {
            label: '视图',
            submenu: viewSubmenu
        },
        // { role: 'windowMenu' }
        {
            label: '窗口',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'zoom', label: '缩放' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front', label: '前置全部窗口' },
                    { type: 'separator' },
                    { role: 'window', label: '窗口' }
                ] : [
                    { role: 'close', label: '关闭' }
                ])
            ]
        },
        {
            role: 'help',
            label: '帮助',
            submenu: [
                {
                    label: '了解更多',
                    click: async () => {
                        await openAllowedExternalUrl('https://github.com/xiaobaoliu849/vocabbook-modern')
                    }
                }
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

function registerGlobalShortcut() {
    globalShortcut.unregisterAll()

    if (!shortcutSettings.globalToggleWindow) {
        return true
    }

    const accelerator = frontendBindingToAccelerator(shortcutSettings.globalToggleWindow)
    if (!accelerator) {
        console.log('Global shortcut registration skipped: invalid binding')
        return false
    }

    const ret = globalShortcut.register(accelerator, toggleMainWindowVisibility)

    if (!ret) {
        console.log('Global shortcut registration failed')
    }

    return ret
}

function updateGlobalShortcut(binding) {
    const normalizedBinding = binding ? normalizeFrontendShortcutBinding(binding) : null
    if (binding && !normalizedBinding) {
        return {
            ok: false,
            binding: shortcutSettings.globalToggleWindow,
            error: 'Invalid shortcut binding'
        }
    }

    const previousBinding = shortcutSettings.globalToggleWindow
    shortcutSettings.globalToggleWindow = normalizedBinding

    const registered = registerGlobalShortcut()
    if (!registered && normalizedBinding) {
        shortcutSettings.globalToggleWindow = previousBinding
        registerGlobalShortcut()
        return {
            ok: false,
            binding: previousBinding,
            error: 'Shortcut is unavailable or already in use'
        }
    }

    saveShortcutSettings()
    return {
        ok: true,
        binding: shortcutSettings.globalToggleWindow
    }
}

function resolvePackagedBackendPath() {
    const exeName = process.platform === 'win32' ? 'vocabbook-backend.exe' : 'vocabbook-backend'
    const candidates = [
        path.join(process.resourcesPath, 'backend-dist', exeName),
        path.join(process.resourcesPath, 'backend-dist', 'vocabbook-backend', exeName)
    ]

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    throw new Error(`Packaged backend executable not found. Checked: ${candidates.join(', ')}`)
}
// Backend crash recovery: restart with linear backoff, give up after N
// consecutive fast failures and tell the renderer so the UI can react.
const BACKEND_MAX_RESTARTS = 3
const BACKEND_RESTART_BASE_DELAY_MS = 2000
// A backend that stayed up this long counts as "stable" and resets the
// restart counter, so an occasional crash days later still gets restarted.
const BACKEND_STABLE_UPTIME_MS = 60000

let backendRestartAttempts = 0
let backendStartedAt = 0
// A failed spawn can fire both 'error' and 'close'; only schedule one restart.
let backendRestartScheduled = false

function notifyBackendStatus(status) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('backend-status', status)
    }
}

function scheduleBackendRestart(code) {
    if (app.isQuiting || backendRestartScheduled) return
    backendRestartScheduled = true
    if (Date.now() - backendStartedAt > BACKEND_STABLE_UPTIME_MS) {
        backendRestartAttempts = 0
    }
    if (backendRestartAttempts >= BACKEND_MAX_RESTARTS) {
        console.error(`Backend exited (code ${code}) too many times; giving up. Restart the app to retry.`)
        notifyBackendStatus('down')
        return
    }
    backendRestartAttempts += 1
    const delay = BACKEND_RESTART_BASE_DELAY_MS * backendRestartAttempts
    console.warn(`Backend exited (code ${code}); restarting in ${delay}ms (attempt ${backendRestartAttempts}/${BACKEND_MAX_RESTARTS})`)
    setTimeout(() => {
        backendRestartScheduled = false
        if (!app.isQuiting) {
            try {
                startBackend()
            } catch (err) {
                console.error('Backend restart failed:', err)
            }
        }
    }, delay)
}

function startBackend() {
    const userDataPath = app.getPath('userData')
    const env = { ...process.env, VOCABBOOK_DATA_DIR: userDataPath }

    if (DEV_MODE) {
        // Start Python backend
        const pythonPath = process.platform === 'win32' ? 'python' : 'python3'

        backendProcess = spawn(pythonPath, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
            cwd: BACKEND_PATH,
            stdio: 'pipe',
            shell: true,
            windowsHide: true,
            env: env
        })
    } else {
        // Start compiled backend executable
        const exePath = resolvePackagedBackendPath()

        backendProcess = spawn(exePath, [], {
            stdio: 'pipe',
            shell: false,
            windowsHide: true,
            env: env
        })
    }

    backendStartedAt = Date.now()

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`)
    })

    backendProcess.stderr.on('data', (data) => {
        console.error(`Backend Error: ${data}`)
    })

    // Spawn failures (missing exe, AV quarantine, EACCES) fire 'error'
    // without a 'close'; without this listener they crash the app.
    backendProcess.on('error', (err) => {
        console.error('Backend process error:', err)
        scheduleBackendRestart('spawn-error')
    })

    backendProcess.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`)
        backendProcess = null
        scheduleBackendRestart(code)
    })
}

function stopBackend() {
    if (backendProcess) {
        if (process.platform === 'win32') {
            // Dev mode spawns through cmd.exe (shell:true); killing the shell
            // alone leaves the python child alive holding port 8000, and the
            // next launch's health check would pass against the STALE code.
            // Kill the whole process tree instead.
            spawn('taskkill', ['/pid', String(backendProcess.pid), '/T', '/F'], { windowsHide: true })
        } else {
            backendProcess.kill()
        }
        backendProcess = null
    }
}

// App lifecycle

// Single instance: a second launch would spawn a second backend fighting over
// port 8000, double-register tray/global shortcuts and race the auto-updater.
// Focus the existing window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
        }
    })
}

if (gotSingleInstanceLock) app.whenReady().then(() => {
    shortcutSettings = loadShortcutSettings()
    createWindow()
    createTray()
    createApplicationMenu()
    registerGlobalShortcut()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })

    // In production, start backend. resolvePackagedBackendPath() throws when
    // the bundle is broken — catch so activate/menu handlers stay registered.
    if (!DEV_MODE) {
        try {
            startBackend()
        } catch (err) {
            console.error('Failed to start backend:', err)
            notifyBackendStatus('down')
        }
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopBackend()
})

app.on('before-quit', () => {
    app.isQuiting = true
})

// ============================================
// Auto Updater Setup
// ============================================

function sendUpdateStatus(status, data = null) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-status', status, data)
    }
}

function setupAutoUpdater() {
    // Configuration
    autoUpdater.autoDownload = false  // User manually triggers download
    autoUpdater.autoInstallOnAppQuit = true

    // electron-updater expects a logger with info/warn/error methods;
    // the console object satisfies that interface.
    autoUpdater.logger = console

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        console.log('Checking for updates...')
        sendUpdateStatus('checking')
    })

    autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info.version)
        sendUpdateStatus('available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        })
    })

    autoUpdater.on('update-not-available', (info) => {
        console.log('No updates available')
        sendUpdateStatus('not-available', { version: info.version })
    })

    autoUpdater.on('download-progress', (progress) => {
        console.log(`Download progress: ${progress.percent.toFixed(1)}%`)
        sendUpdateStatus('downloading', {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded:', info.version)
        sendUpdateStatus('downloaded', {
            version: info.version,
            releaseNotes: info.releaseNotes
        })
    })

    autoUpdater.on('error', (err) => {
        console.error('Update error:', err)
        sendUpdateStatus('error', err.message || 'Unknown error')
    })
}

// IPC Handlers for renderer process
ipcMain.handle('check-for-updates', async () => {
    try {
        return await autoUpdater.checkForUpdates()
    } catch (error) {
        console.error('Check for updates failed:', error)
        throw error
    }
})

ipcMain.handle('download-update', async () => {
    try {
        return await autoUpdater.downloadUpdate()
    } catch (error) {
        console.error('Download update failed:', error)
        throw error
    }
})

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle('get-app-version', () => {
    return app.getVersion()
})

ipcMain.handle('get-shortcut-settings', () => {
    return { ...shortcutSettings }
})

ipcMain.handle('update-global-shortcut', (_event, binding) => {
    return updateGlobalShortcut(binding)
})

// Initialize auto updater when app is ready (only in production)
app.whenReady().then(() => {
    setupAutoUpdater()

    // Check for updates on startup in production mode (after a delay)
    if (!DEV_MODE) {
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch(err => {
                console.log('Auto update check failed:', err.message)
            })
        }, 3000)
    }
})
