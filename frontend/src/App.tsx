import { Suspense, lazy, useEffect, useState } from 'react'
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

// How many recently-visited non-chat pages stay mounted (bounded LRU keep-alive).
// The chat page is always preserved so conversations survive navigation.
const MAX_KEPT_PAGES = 3

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
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-warm-200 bg-white/70 text-sm text-warm-500 shadow-sm dark:border-warm-700 dark:bg-warm-900/40 dark:text-warm-300">
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

  // Bounded LRU keep-alive: visited pages stay mounted (preserving form/scroll
  // state) until the non-chat cap is exceeded, then the least-recently-visited
  // page is unmounted to bound memory. Chat is never evicted.
  useEffect(() => {
    setMountedPages(prev => {
      // Re-anchor the visited page at the end so Map/array order reflects
      // recency — otherwise eviction would be FIFO by first visit and drop
      // the most-used pages first.
      const withoutCurrent = prev.filter(page => page !== currentPage)
      const next = [...withoutCurrent, currentPage]
      const nonChat = next.filter(page => page !== 'chat')
      if (nonChat.length > MAX_KEPT_PAGES) {
        const removed = new Set<Page>(nonChat.slice(0, nonChat.length - MAX_KEPT_PAGES))
        return next.filter(page => !removed.has(page))
      }
      return next
    })
  }, [currentPage])

  const shouldRenderPage = (page: Page) => mountedPages.includes(page)
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

  // Tray menu navigation (electron main → preload dispatches 'navigate').
  // Without this listener the tray "开始复习" item only showed the window.
  useEffect(() => {
    const pages: Page[] = ['add', 'list', 'review', 'settings', 'import', 'translation', 'stats', 'chat', 'admin']
    const handleNavigate = (event: Event) => {
      const target = (event as CustomEvent).detail
      if (typeof target === 'string' && pages.includes(target as Page)) {
        setCurrentPage(target as Page)
      }
    }
    window.addEventListener('navigate', handleNavigate)
    return () => window.removeEventListener('navigate', handleNavigate)
  }, [])

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
      <main className="flex-1 overflow-auto bg-[var(--bg-primary)]">
        <div className="p-6 lg:p-8 max-w-5xl mx-auto">
          {shouldRenderPage('add') && (
            <div className={getPageClassName('add')}>
              <Suspense fallback={<PageFallback />}>
                <AddWordPage onOpenImport={() => setCurrentPage('import')} isActive={currentPage === 'add'} />
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-white dark:bg-warm-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-scale-up border border-warm-200 dark:border-warm-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-warm-800/80 backdrop-blur-md border-b border-warm-100 dark:border-warm-700">
              <h3 className="text-xl font-bold text-warm-800 dark:text-white flex items-center gap-2">
                {t('shortcuts.title', '⌨️ Keyboard Shortcuts')}
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 rounded-xl hover:bg-warm-100 dark:hover:bg-warm-700 transition-all text-warm-400 hover:text-warm-600"
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
                    <h4 className="text-sm font-bold text-warm-500 dark:text-warm-400 uppercase tracking-wider mb-3">
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
    <div className="flex items-center justify-between p-2 rounded-lg bg-warm-50 dark:bg-warm-900/50">
      <span className="text-sm text-warm-600 dark:text-warm-300">{desc}</span>
      <div className="flex flex-wrap justify-end gap-2">
        {bindings.map((binding) => (
          <div key={binding} className="flex gap-1">
            {formatShortcutBinding(binding, platform).map((key) => (
              <kbd
                key={`${binding}-${key}`}
                className="px-2 py-1 text-xs font-mono bg-warm-200 dark:bg-warm-700 text-warm-700 dark:text-warm-300 rounded border border-warm-300 dark:border-warm-600 shadow-sm"
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
