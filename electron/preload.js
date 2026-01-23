const { contextBridge } = require('electron')

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

// Indicate that we're running in Electron
contextBridge.exposeInMainWorld('isElectron', true)
