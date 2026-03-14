import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type DictionaryId = 'youdao' | 'cambridge' | 'bing' | 'freedict'

export default function DictionarySection() {
    const { t } = useTranslation()
    const [enabledMap, setEnabledMap] = useState<Record<DictionaryId, boolean>>(() => ({
        youdao: true,
        cambridge: localStorage.getItem('dict_cambridge') !== 'false',
        bing: localStorage.getItem('dict_bing') !== 'false',
        freedict: localStorage.getItem('dict_freedict') !== 'false',
    }))

    const dictionaries = [
        { id: 'youdao' as const, name: t('settings.dict.youdaoName', 'Youdao Dictionary'), desc: t('settings.dict.youdaoDesc', 'Accurate Chinese meanings with rich roots and affixes'), fixed: true },
        { id: 'cambridge' as const, name: t('settings.dict.cambridgeName', 'Cambridge Dictionary'), desc: t('settings.dict.cambridgeDesc', 'Authoritative English definitions with high-quality examples'), fixed: false },
        { id: 'bing' as const, name: t('settings.dict.bingName', 'Bing Dictionary'), desc: t('settings.dict.bingDesc', 'Word forms and common collocations'), fixed: false },
        { id: 'freedict' as const, name: t('settings.dict.freedictName', 'Free Dictionary'), desc: t('settings.dict.freedictDesc', 'English definitions for deeper understanding'), fixed: false },
    ]

    const toggleDict = (id: DictionaryId, fixed: boolean) => {
        if (fixed) return
        setEnabledMap(prev => {
            const next = !prev[id]
            localStorage.setItem(`dict_${id}`, String(next))
            return { ...prev, [id]: next }
        })
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    {t('settings.dict.title', '词典源设置')}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {t('settings.dict.desc', '管理查词时使用的词典资源')}
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    📚 {t('settings.dict.enableDict', '启用词典')}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                    {t('settings.dict.enableDictDesc', '在查询单词时启用多个词典以获取更全面的释义')}
                </p>

                <div className="space-y-4">
                    {dictionaries.map((dict) => (
                        <div key={dict.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                            <div>
                                <div className="font-medium text-slate-700 dark:text-slate-300">
                                    {dict.name}
                                </div>
                                <div className="text-xs text-slate-500">{dict.desc}</div>
                            </div>
                            <button
                                onClick={() => toggleDict(dict.id, dict.fixed)}
                                disabled={dict.fixed}
                                className={`relative w-12 h-6 rounded-full transition-colors ${enabledMap[dict.id] ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
                                    } ${dict.fixed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                <div
                                    className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${enabledMap[dict.id] ? 'translate-x-7' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
