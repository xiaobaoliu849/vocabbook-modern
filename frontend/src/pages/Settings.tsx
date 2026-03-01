import SettingsLayout from './settings/SettingsLayout'

interface SettingsProps {
    initialTab?: string
    onTabChange?: (tab: string) => void
}

export default function Settings({ initialTab, onTabChange }: SettingsProps) {
    return <SettingsLayout initialTab={initialTab} onTabChange={onTabChange} />
}
