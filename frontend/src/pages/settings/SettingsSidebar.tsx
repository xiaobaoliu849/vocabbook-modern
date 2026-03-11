

import { useTranslation } from 'react-i18next';

type TabId = 'account' | 'general' | 'dict' | 'ai' | 'about';

interface SettingsSidebarProps {
    activeTab: TabId;
    setActiveTab: (tab: TabId) => void;
}

export default function SettingsSidebar({ activeTab, setActiveTab }: SettingsSidebarProps) {
    const { t } = useTranslation();
    const tabs: { id: TabId; label: string; icon: string }[] = [
        { id: 'account', label: t('settings.tabs.account', '账户'), icon: '👤' },
        { id: 'general', label: t('settings.tabs.general', '常规设置'), icon: '⚙️' },
        { id: 'dict', label: t('settings.tabs.dict', '词典源'), icon: '📚' },
        { id: 'ai', label: t('settings.tabs.ai', 'AI 助手'), icon: '🤖' },
        { id: 'about', label: t('settings.tabs.about', '关于'), icon: 'ℹ️' },
    ];

    return (
        <div className="w-full md:w-40 shrink-0 space-y-2 mb-6 md:mb-0">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${activeTab === tab.id
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium shadow-sm ring-1 ring-primary-200 dark:ring-primary-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                >
                    <span className="text-xl">{tab.icon}</span>
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
    );
}
