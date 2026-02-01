import { useState } from 'react'
import SettingsSidebar from './SettingsSidebar'
import StatisticsSection from './sections/StatisticsSection'
import GeneralSection from './sections/GeneralSection'
import DictionarySection from './sections/DictionarySection'
import AISection from './sections/AISection'
import AboutSection from './sections/AboutSection'

type TabId = 'stats' | 'general' | 'dict' | 'ai' | 'about';

export default function SettingsLayout() {
    const [activeTab, setActiveTab] = useState<TabId>('stats')

    return (
        // 使用负边距抵消父级 padding，并使用 calc 计算精确高度以占满视口
        // 这样可以让此布局成为独立的滚动容器
        <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto h-[calc(100vh-3rem-3rem)] lg:h-[calc(100vh-4rem-4rem)]">
            {/* Sidebar - 固定不滚动 */}
            <div className="shrink-0 md:w-48 flex flex-col">
                <div className="mb-6 px-2">
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                        设置
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Preferences
                    </p>
                </div>
                <SettingsSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            {/* Content Area - 独立滚动 */}
            <div className="flex-1 min-w-0 overflow-y-auto pr-2">
                <div className="animate-fade-in">
                    {activeTab === 'stats' && <StatisticsSection />}
                    {activeTab === 'general' && <GeneralSection />}
                    {activeTab === 'dict' && <DictionarySection />}
                    {activeTab === 'ai' && <AISection />}
                    {activeTab === 'about' && <AboutSection />}
                </div>
            </div>
        </div>
    )
}
