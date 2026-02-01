const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const { autoUpdater } = require('electron-updater')

let mainWindow = null
let tray = null
let backendProcess = null

// Configuration
const DEV_MODE = process.env.NODE_ENV === 'development'
const FRONTEND_URL = DEV_MODE ? 'http://localhost:5173' : `file://${path.join(__dirname, '../frontend/dist/index.html')}`
const BACKEND_PATH = path.join(__dirname, '../backend')
const HOTKEY = 'CommandOrControl+Alt+V'

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'default',
        backgroundColor: '#0f172a',
        show: false
    })

    mainWindow.loadURL(FRONTEND_URL)

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
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

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png')
    const icon = nativeImage.createFromPath(iconPath)

    tray = new Tray(icon.resize({ width: 16, height: 16 }))

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
                mainWindow.webContents.executeJavaScript(`
          window.dispatchEvent(new CustomEvent('navigate', { detail: 'review' }))
        `)
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
            submenu: [
                { role: 'reload', label: '刷新' },
                { role: 'forceReload', label: '强制刷新' },
                { role: 'toggleDevTools', label: '开发者工具' },
                { type: 'separator' },
                { role: 'resetZoom', label: '实际大小' },
                { role: 'zoomIn', label: '放大' },
                { role: 'zoomOut', label: '缩小' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '切换全屏' }
            ]
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
                        const { shell } = require('electron')
                        await shell.openExternal('https://github.com/vocabbook/vocabbook-modern')
                    }
                }
            ]
        }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

function registerGlobalShortcut() {
    const ret = globalShortcut.register(HOTKEY, () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide()
            } else {
                mainWindow.show()
                mainWindow.focus()
            }
        }
    })

    if (!ret) {
        console.log('Global shortcut registration failed')
    }
}

function startBackend() {
    // Start Python backend
    const pythonPath = process.platform === 'win32' ? 'python' : 'python3'

    backendProcess = spawn(pythonPath, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
        cwd: BACKEND_PATH,
        stdio: 'pipe',
        shell: true
    })

    backendProcess.stdout.on('data', (data) => {
        console.log(`Backend: ${data}`)
    })

    backendProcess.stderr.on('data', (data) => {
        console.error(`Backend Error: ${data}`)
    })

    backendProcess.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`)
    })
}

function stopBackend() {
    if (backendProcess) {
        backendProcess.kill()
        backendProcess = null
    }
}

// App lifecycle
app.whenReady().then(() => {
    createWindow()
    createTray()
    createApplicationMenu()
    registerGlobalShortcut()

    // In production, start backend
    if (!DEV_MODE) {
        startBackend()
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
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

    // Logging for debugging
    autoUpdater.logger = require('electron').app

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
