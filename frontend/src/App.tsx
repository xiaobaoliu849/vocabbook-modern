import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ThemeProvider } from './context/ThemeContext'
import { ShortcutProvider, useShortcuts } from './context/ShortcutContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import AddWord from './pages/AddWord'
import WordList from './pages/WordList'
import Review from './pages/Review'
import Settings from './pages/Settings'
import ImportWords from './pages/ImportWords'
import TranslationPage from './pages/TranslationPage'
import StatisticsPage from './pages/StatisticsPage'
import AIChat from './pages/AIChat'
import AdminPanel from './pages/AdminPanel'
import DictionaryPopup from './components/DictionaryPopup'
import SelectionActionBar from './components/SelectionActionBar'
import { formatShortcutBinding, shortcutDefinitionMap, shortcutGroups, type ShortcutId } from './utils/shortcuts'
import './App.css'

type Page = 'add' | 'list' | 'review' | 'settings' | 'import' | 'translation' | 'stats' | 'chat' | 'admin'

function AppContent() {
  const { t } = useTranslation()
  const { getBindings, isElectron, matches, platform } = useShortcuts()
  const [currentPage, setCurrentPage] = useState<Page>('add')
  const [showHelp, setShowHelp] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined)

  // Global keyboard shortcuts
  useEffect(() => {
    const navigationShortcuts: Array<{ id: ShortcutId; page: Page }> = [
      { id: 'app.navigateAdd', page: 'add' },
      { id: 'app.navigateList', page: 'list' },
      { id: 'app.navigateReview', page: 'review' },
      { id: 'app.navigateChat', page: 'chat' },
      { id: 'app.navigateStats', page: 'stats' },
      { id: 'app.navigateSettings', page: 'settings' },
    ]

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement
      if (matches(e, 'common.closeDialog') && showHelp) {
        e.preventDefault()
        setShowHelp(false)
        return
      }

      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (matches(e, 'app.toggleHelp')) {
        e.preventDefault()
        setShowHelp(prev => !prev)
        return
      }

      const matchedNavigation = navigationShortcuts.find(({ id }) => matches(e, id))
      if (matchedNavigation) {
        e.preventDefault()
        setCurrentPage(matchedNavigation.page)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [matches, showHelp])

  // Navigate to settings with optional tab
  const handleNavigateToSettings = (tab?: string) => {
    setSettingsTab(tab)
    setCurrentPage('settings')
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onNavigateToSettings={handleNavigateToSettings}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {/* 保持所有页面常驻挂载，用 CSS 控制显示/隐藏，避免热力图等组件重新挂载导致闪现 */}
          <div className={currentPage === 'add' ? '' : 'hidden'}>
            <AddWord onOpenImport={() => setCurrentPage('import')} />
          </div>
          <div className={currentPage === 'list' ? '' : 'hidden'}><WordList isActive={currentPage === 'list'} /></div>
          <div className={currentPage === 'review' ? '' : 'hidden'}><Review isActive={currentPage === 'review'} /></div>
          <div className={currentPage === 'translation' ? '' : 'hidden'}>
            <TranslationPage onBack={() => setCurrentPage('chat')} />
          </div>
          <div className={currentPage === 'stats' ? '' : 'hidden'}><StatisticsPage /></div>
          <div className={currentPage === 'chat' ? '' : 'hidden'}>
            <AIChat isActive={currentPage === 'chat'} onOpenTranslation={() => setCurrentPage('translation')} />
          </div>
          <div className={currentPage === 'admin' ? '' : 'hidden'}><AdminPanel /></div>
          <div className={currentPage === 'import' ? '' : 'hidden'}><ImportWords /></div>
          <div className={currentPage === 'settings' ? '' : 'hidden'}>
            <Settings
              initialTab={settingsTab}
              onTabChange={(tab) => setSettingsTab(tab)}
              onOpenAdmin={() => setCurrentPage('admin')}
            />
          </div>
        </div>
      </main>

      {/* Global Inline Popup */}
      <SelectionActionBar />
      <DictionaryPopup />

      {/* Keyboard Shortcuts Help Panel */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-scale-up border border-slate-200 dark:border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                {t('shortcuts.title', '⌨️ Keyboard Shortcuts')}
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {shortcutGroups.map((group) => {
                const visibleShortcutIds = group.shortcutIds.filter((shortcutId) => {
                  const definition = shortcutDefinitionMap[shortcutId]
                  if (definition.desktopOnly && !isElectron) {
                    return false
                  }
                  return true
                })

                if (visibleShortcutIds.length === 0) {
                  return null
                }

                return (
                  <div key={group.id}>
                    <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                      {t(group.titleKey, group.fallbackTitle)}
                    </h4>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {visibleShortcutIds.map((shortcutId) => {
                        const definition = shortcutDefinitionMap[shortcutId]
                        return (
                          <ShortcutItem
                            key={shortcutId}
                            bindings={getBindings(shortcutId)}
                            desc={t(definition.labelKey, definition.fallbackLabel)}
                            platform={platform}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Shortcut display component
function ShortcutItem({ bindings, desc, platform }: { bindings: string[]; desc: string; platform: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50">
      <span className="text-sm text-slate-600 dark:text-slate-300">{desc}</span>
      <div className="flex flex-wrap justify-end gap-2">
        {bindings.map((binding) => (
          <div key={binding} className="flex gap-1">
            {formatShortcutBinding(binding, platform).map((key) => (
              <kbd
                key={`${binding}-${key}`}
                className="px-2 py-1 text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-600 shadow-sm"
              >
                {key}
              </kbd>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ShortcutProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </ShortcutProvider>
    </ThemeProvider>
  )
}

export default App
