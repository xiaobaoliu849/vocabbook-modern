export {}

declare global {
    interface Window {
        electronAPI?: {
            platform: string
            checkForUpdates: () => Promise<void>
            downloadUpdate: () => Promise<void>
            installUpdate: () => Promise<void>
            getAppVersion: () => Promise<string>
            onUpdateStatus: (callback: (status: string, data: unknown) => void) => void
            removeUpdateStatusListener: () => void
            getShortcutSettings?: () => Promise<{
                globalToggleWindow?: string | null
            }>
            updateGlobalShortcut?: (binding: string | null) => Promise<{
                ok: boolean
                binding: string | null
                error?: string
            }>
        }
        isElectron?: boolean
    }
}
