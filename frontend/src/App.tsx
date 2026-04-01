import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ThemeProvider } from './context/ThemeContext'
import { ShortcutProvider, useShortcuts } from './context/ShortcutContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import DictionaryPopup from './components/DictionaryPopup'
import SelectionActionBar from './components/SelectionActionBar'
import { formatShortcutBinding, shortcutDefinitionMap, shortcutGroups, type ShortcutId } from './utils/shortcuts'
import './App.css'

type Page = 'add' | 'list' | 'review' | 'settings' | 'import' | 'translation' | 'stats' | 'chat' | 'admin'

const AddWordPage = lazy(() => import('./pages/AddWord'))
const WordListPage = lazy(() => import('./pages/WordList'))
const ReviewPage = lazy(() => import('./pages/Review'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const ImportWordsPage = lazy(() => import('./pages/ImportWords'))
const TranslationPage = lazy(() => import('./pages/TranslationPage'))
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'))
const AIChatPage = lazy(() => import('./pages/AIChat'))
const AdminPanelPage = lazy(() => import('./pages/AdminPanel'))

function PageFallback() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
      Loading page...
    </div>
  )
}

function AppContent() {
  const { t } = useTranslation()
  const { getBindings, isElectron, matches, platform } = useShortcuts()
  const [currentPage, setCurrentPage] = useState<Page>('add')
  const [mountedPages, setMountedPages] = useState<Page[]>(['add'])
  const [showHelp, setShowHelp] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined)

  useEffect(() => {
    setMountedPages((prev) => (prev.includes(currentPage) ? prev : [...prev, currentPage]))
  }, [currentPage])

  const mountedPageSet = useMemo(() => new Set(mountedPages), [mountedPages])
  const shouldRenderPage = (page: Page) => currentPage === page || mountedPageSet.has(page)
  const getPageClassName = (page: Page) => (currentPage === page ? '' : 'hidden')

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
          {shouldRenderPage('add') && (
            <div className={getPageClassName('add')}>
              <Suspense fallback={<PageFallback />}>
                <AddWordPage onOpenImport={() => setCurrentPage('import')} />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('list') && (
            <div className={getPageClassName('list')}>
              <Suspense fallback={<PageFallback />}>
                <WordListPage isActive={currentPage === 'list'} />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('review') && (
            <div className={getPageClassName('review')}>
              <Suspense fallback={<PageFallback />}>
                <ReviewPage isActive={currentPage === 'review'} />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('translation') && (
            <div className={getPageClassName('translation')}>
              <Suspense fallback={<PageFallback />}>
                <TranslationPage onBack={() => setCurrentPage('chat')} />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('stats') && (
            <div className={getPageClassName('stats')}>
              <Suspense fallback={<PageFallback />}>
                <StatisticsPage />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('chat') && (
            <div className={getPageClassName('chat')}>
              <Suspense fallback={<PageFallback />}>
                <AIChatPage isActive={currentPage === 'chat'} onOpenTranslation={() => setCurrentPage('translation')} />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('admin') && (
            <div className={getPageClassName('admin')}>
              <Suspense fallback={<PageFallback />}>
                <AdminPanelPage />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('import') && (
            <div className={getPageClassName('import')}>
              <Suspense fallback={<PageFallback />}>
                <ImportWordsPage />
              </Suspense>
            </div>
          )}
          {shouldRenderPage('settings') && (
            <div className={getPageClassName('settings')}>
              <Suspense fallback={<PageFallback />}>
                <SettingsPage
                  initialTab={settingsTab}
                  onTabChange={(tab) => setSettingsTab(tab)}
                  onOpenAdmin={() => setCurrentPage('admin')}
                />
              </Suspense>
            </div>
          )}
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
