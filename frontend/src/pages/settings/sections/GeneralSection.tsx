import type { ReactNode } from 'react'
import { useTheme } from '../../../context/ThemeContext'
import { useState, useEffect } from 'react'
import { Check, Monitor, Moon, Sun, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ShortcutPreferencesCard from './ShortcutPreferencesCard'

type AppearanceMode = 'light' | 'dark' | 'system'

interface ChoiceCardOption<T extends string> {
    value: T
    label: string
    description: string
    supporting?: string
    visual: ReactNode
}

interface ChoiceCardGroupProps<T extends string> {
    value: T
    onChange: (value: T) => void
    options: ChoiceCardOption<T>[]
    groupLabel: string
    columnsClassName?: string
}

function ChoiceCardGroup<T extends string>({
    value,
    onChange,
    options,
    groupLabel,
    columnsClassName = 'sm:grid-cols-2',
}: ChoiceCardGroupProps<T>) {
    return (
        <div role="radiogroup" aria-label={groupLabel} className={`grid grid-cols-1 gap-4 ${columnsClassName}`}>
            {options.map((option) => {
                const selected = option.value === value
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={`relative group flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all duration-300 ${
                            selected
                                ? 'border-primary-500 bg-primary-50/60 shadow-lg shadow-primary-500/10 ring-4 ring-primary-500/10 dark:bg-primary-900/15'
                                : 'border-slate-200 bg-white/70 hover:border-primary-300 hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-primary-700 dark:hover:bg-slate-800'
                        }`}
                    >
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-lg transition-colors ${
                            selected
                                ? 'border-primary-200 bg-white text-primary-600 dark:border-primary-800 dark:bg-slate-800 dark:text-primary-300'
                                : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                            {option.visual}
                        </div>
                        <div className="min-w-0">
                            <div className={`font-semibold transition-colors ${
                                selected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-800 dark:text-slate-100'
                            }`}>
                                {option.label}
                            </div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {option.description}
                            </div>
                            {option.supporting && (
                                <div className="mt-3 inline-flex rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
                                    {option.supporting}
                                </div>
                            )}
                        </div>
                        {selected && (
                            <div className="absolute right-4 top-4 rounded-full bg-primary-500 p-1 text-white shadow-sm animate-scale-in">
                                <Check size={14} strokeWidth={3} />
                            </div>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

export default function GeneralSection() {
    const { theme, setTheme } = useTheme()
    const { t } = useTranslation()

    const [accent, setAccent] = useState<'us' | 'uk'>(() =>
        (localStorage.getItem('preferred_accent') as 'us' | 'uk') || 'us'
    )

    useEffect(() => {
        localStorage.setItem('preferred_accent', accent)
    }, [accent])

    const appearanceOptions: ChoiceCardOption<AppearanceMode>[] = [
        {
            value: 'light',
            label: t('settings.general.lightMode', 'Light Mode'),
            description: t('settings.general.appearanceOptions.lightDesc', 'Bright surfaces and higher contrast for daytime work'),
            supporting: t('settings.general.appearanceOptions.lightTag', 'Always Light'),
            visual: <Sun size={20} />,
        },
        {
            value: 'dark',
            label: t('settings.general.darkMode', 'Dark Mode'),
            description: t('settings.general.appearanceOptions.darkDesc', 'Muted tones that reduce glare in low-light environments'),
            supporting: t('settings.general.appearanceOptions.darkTag', 'Always Dark'),
            visual: <Moon size={20} />,
        },
        {
            value: 'system',
            label: t('settings.general.systemMode', 'System'),
            description: t('settings.general.appearanceOptions.systemDesc', 'Follow your device appearance automatically'),
            supporting: t('settings.general.appearanceOptions.systemTag', 'Automatic'),
            visual: <Monitor size={20} />,
        },
    ]

    const accentOptions = [
        {
            value: 'us' as const,
            flag: '🇺🇸',
            label: t('settings.general.usEnglish', 'American English'),
            tag: t('settings.general.usAccentLabel', 'General American'),
            description: t('settings.general.usEnglishDesc', 'Rhotic accent · energetic and expressive'),
        },
        {
            value: 'uk' as const,
            flag: '🇬🇧',
            label: t('settings.general.ukEnglish', 'British English'),
            tag: t('settings.general.ukAccentLabel', 'Received Pronunciation'),
            description: t('settings.general.ukEnglishDesc', 'Clear articulation · elegant and restrained'),
        },
    ]

    const selectedAccent = accentOptions.find((option) => option.value === accent) ?? accentOptions[0]

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    {t('settings.general.title', 'General Settings')}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {t('settings.general.desc', 'Customize the app appearance and basic preferences')}
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    🎨 {t('settings.general.appearance', 'Appearance')}
                </h3>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                    {t('settings.general.appearanceDesc', 'Choose whether the interface stays light, dark, or follows your system')}
                </p>
                <ChoiceCardGroup
                    value={theme}
                    onChange={setTheme}
                    options={appearanceOptions}
                    groupLabel={t('settings.general.appearance', 'Appearance')}
                    columnsClassName="xl:grid-cols-3"
                />
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Volume2 className="text-primary-500" size={20} />
                    {t('settings.general.pronunciation', 'Pronunciation Preference')}
                </h3>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {accentOptions.map((option) => {
                            const selected = option.value === accent
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setAccent(option.value)}
                                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                                        selected
                                            ? 'border-primary-200 bg-white text-primary-700 shadow-sm dark:border-primary-800 dark:bg-slate-800 dark:text-primary-300'
                                            : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/80'
                                    }`}
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl dark:border-slate-700 dark:bg-slate-800">
                                        {option.flag}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold">{option.label}</span>
                                        <span className="mt-1 inline-flex rounded-full border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                            {option.tag}
                                        </span>
                                    </span>
                                    {selected && (
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                                            <Check size={14} strokeWidth={3} />
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{selectedAccent.label}</span>
                    {' · '}
                    {selectedAccent.description}
                </div>
            </div>

            <ShortcutPreferencesCard />
        </div>
    )
}
