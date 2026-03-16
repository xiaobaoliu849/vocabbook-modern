import SettingsLayout from './settings/SettingsLayout'

interface SettingsProps {
    initialTab?: string
    onTabChange?: (tab: string) => void
    onOpenAdmin?: () => void
}

export default function Settings({ initialTab, onTabChange, onOpenAdmin }: SettingsProps) {
    return <SettingsLayout initialTab={initialTab} onTabChange={onTabChange} onOpenAdmin={onOpenAdmin} />
}
