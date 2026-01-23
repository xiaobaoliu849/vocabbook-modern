const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

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

    // Handle close to tray
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault()
            mainWindow.hide()
        }
    })

    // Open DevTools in development
    if (DEV_MODE) {
        mainWindow.webContents.openDevTools()
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
    const pythonPath = process.platform === 'win32' ? 'py' : 'python3'

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
