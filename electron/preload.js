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
    }
})

// Listen for search trigger from main process
ipcRenderer.on('trigger-search', (event, text) => {
    window.dispatchEvent(new CustomEvent('search-word', { detail: text }))
})

// Indicate that we're running in Electron
contextBridge.exposeInMainWorld('isElectron', true)
