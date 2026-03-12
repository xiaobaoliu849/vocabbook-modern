import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ThemeProvider } from './context/ThemeContext'
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
import DictionaryPopup from './components/DictionaryPopup'
import './App.css'

type Page = 'add' | 'list' | 'review' | 'settings' | 'import' | 'translation' | 'stats' | 'chat'

function AppContent() {
  const { t } = useTranslation()
  const [currentPage, setCurrentPage] = useState<Page>('add')
  const [showHelp, setShowHelp] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined)

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Escape to close help panel even in input
        if (e.key === 'Escape' && showHelp) {
          setShowHelp(false)
        }
        return
      }

      // Show help panel with ? only (not / which is used for search in WordList)
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp(prev => !prev)
        return
      }

      // Close help with Escape
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false)
        return
      }

      // Ctrl+Number for page navigation
      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        switch (e.key) {
          case '1':
            e.preventDefault()
            setCurrentPage('add')
            break
          case '2':
            e.preventDefault()
            setCurrentPage('list')
            break
          case '3':
            e.preventDefault()
            setCurrentPage('review')
            break
          case '4':
            e.preventDefault()
            setCurrentPage('settings')
            break
          case '5':
            e.preventDefault()
            setCurrentPage('import')
            break
          case '6':
            e.preventDefault()
            setCurrentPage('translation')
            break
          case '7':
            e.preventDefault()
            setCurrentPage('stats')
            break
          case '8':
            e.preventDefault()
            setCurrentPage('chat')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showHelp])

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
          <div className={currentPage === 'add' ? '' : 'hidden'}><AddWord /></div>
          <div className={currentPage === 'list' ? '' : 'hidden'}><WordList isActive={currentPage === 'list'} /></div>
          <div className={currentPage === 'review' ? '' : 'hidden'}><Review isActive={currentPage === 'review'} /></div>
          <div className={currentPage === 'translation' ? '' : 'hidden'}><TranslationPage /></div>
          <div className={currentPage === 'stats' ? '' : 'hidden'}><StatisticsPage /></div>
          <div className={currentPage === 'chat' ? '' : 'hidden'}><AIChat isActive={currentPage === 'chat'} /></div>
          <div className={currentPage === 'import' ? '' : 'hidden'}><ImportWords /></div>
          <div className={currentPage === 'settings' ? '' : 'hidden'}>
            <Settings initialTab={settingsTab} onTabChange={(tab) => setSettingsTab(tab)} />
          </div>
        </div>
      </main>

      {/* Global Inline Popup */}
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
              {/* Global Shortcuts */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('shortcuts.globalNavigation', 'Global Navigation')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['Ctrl', '1']} desc={t('sidebar.add', 'Vocabulary Hub')} />
                  <ShortcutItem keys={['Ctrl', '2']} desc={t('sidebar.list', 'Word List')} />
                  <ShortcutItem keys={['Ctrl', '3']} desc={t('sidebar.review', 'Smart Review')} />
                  <ShortcutItem keys={['Ctrl', '4']} desc={t('sidebar.settings', 'Settings')} />
                  <ShortcutItem keys={['Ctrl', '5']} desc={t('sidebar.import', 'Batch Import')} />
                  <ShortcutItem keys={['Ctrl', '6']} desc={t('sidebar.translation', 'Translator')} />
                  <ShortcutItem keys={['Ctrl', '7']} desc={t('sidebar.stats', 'Statistics')} />
                  <ShortcutItem keys={['Ctrl', '8']} desc={t('sidebar.chat', 'AI Partner')} />
                  <ShortcutItem keys={['?']} desc={t('shortcuts.toggleHelp', 'Show / Hide Help')} />
                  <ShortcutItem keys={['Esc']} desc={t('shortcuts.closeModal', 'Close Dialog')} />
                </div>
              </div>

              {/* Review Page */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('sidebar.review', 'Smart Review')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['Space']} desc={t('shortcuts.flipCard', 'Flip Card')} />
                  <ShortcutItem keys={['1-5']} desc={t('shortcuts.reviewScore', 'Rate Memory (1 forgotten - 5 perfect)')} />
                  <ShortcutItem keys={['P']} desc={t('shortcuts.playPronunciation', 'Play Pronunciation')} />
                  <ShortcutItem keys={['Tab']} desc={t('shortcuts.switchReviewMode', 'Switch Review / Spelling Mode')} />
                  <ShortcutItem keys={['H']} desc={t('shortcuts.showSpellingHint', 'Show Spelling Hint')} />
                </div>
              </div>

              {/* Word List */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('sidebar.list', 'Word List')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['↑', '↓']} desc={t('shortcuts.selectWord', 'Select Word')} />
                  <ShortcutItem keys={['Enter']} desc={t('shortcuts.viewDetails', 'View Details')} />
                  <ShortcutItem keys={['Delete']} desc={t('shortcuts.deleteWord', 'Delete Word')} />
                  <ShortcutItem keys={['M']} desc={t('shortcuts.markMastered', 'Mark as Mastered')} />
                  <ShortcutItem keys={['/']} desc={t('shortcuts.quickSearch', 'Quick Search')} />
                </div>
              </div>

              {/* Add Word */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('sidebar.add', 'Vocabulary Hub')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['Ctrl', 'Enter']} desc={t('shortcuts.addToVocabBook', 'Add to VocabBook')} />
                  <ShortcutItem keys={['Ctrl', 'G']} desc={t('shortcuts.generateExample', 'Generate Example with AI')} />
                  <ShortcutItem keys={['Ctrl', 'P']} desc={t('shortcuts.playPronunciation', 'Play Pronunciation')} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Shortcut display component
function ShortcutItem({ keys, desc }: { keys: string[], desc: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50">
      <span className="text-sm text-slate-600 dark:text-slate-300">{desc}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <kbd
            key={i}
            className="px-2 py-1 text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-600 shadow-sm"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  )
}

export default App
