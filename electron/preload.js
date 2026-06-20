const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,

    // Navigation from tray menu
    onNavigate: (callback) => {
        window.addEventListener('navigate', (event) => {
            callback(event.detail)
        })
    },

    // Auto Update APIs
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getShortcutSettings: () => ipcRenderer.invoke('get-shortcut-settings'),
    updateGlobalShortcut: (binding) => ipcRenderer.invoke('update-global-shortcut', binding),
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (_event, status, data) => callback(status, data))
    },
    removeUpdateStatusListener: () => {
        ipcRenderer.removeAllListeners('update-status')
    }
})

// Listen for search trigger from main process
ipcRenderer.on('trigger-search', (_event, text) => {
    window.dispatchEvent(new CustomEvent('search-word', { detail: text }))
})

ipcRenderer.on('navigate-to', (_event, target) => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: target }))
})

// Indicate that we're running in Electron
contextBridge.exposeInMainWorld('isElectron', true)
