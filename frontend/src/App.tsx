import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import AddWord from './pages/AddWord'
import WordList from './pages/WordList'
import Review from './pages/Review'
import Settings from './pages/Settings'
import './App.css'

type Page = 'add' | 'list' | 'review' | 'settings'

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('add')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const handleSearchWord = () => {
      setCurrentPage('add')
    }
    window.addEventListener('search-word', handleSearchWord)
    return () => window.removeEventListener('search-word', handleSearchWord)
  }, [])

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
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showHelp])

  return (
    <div className="flex h-screen">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {/* 保持所有页面常驻挂载，用 CSS 控制显示/隐藏，避免热力图等组件重新挂载导致闪现 */}
          <div className={currentPage === 'add' ? '' : 'hidden'}><AddWord /></div>
          <div className={currentPage === 'list' ? '' : 'hidden'}><WordList isActive={currentPage === 'list'} /></div>
          <div className={currentPage === 'review' ? '' : 'hidden'}><Review isActive={currentPage === 'review'} /></div>
          <div className={currentPage === 'settings' ? '' : 'hidden'}>
            <Settings />
          </div>
        </div>
      </main>

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
                ⌨️ 键盘快捷键
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
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">全局导航</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['Ctrl', '1']} desc="词汇中心" />
                  <ShortcutItem keys={['Ctrl', '2']} desc="单词列表" />
                  <ShortcutItem keys={['Ctrl', '3']} desc="智能复习" />
                  <ShortcutItem keys={['Ctrl', '4']} desc="设置" />
                  <ShortcutItem keys={['?']} desc="显示/隐藏帮助" />
                  <ShortcutItem keys={['Esc']} desc="关闭弹窗" />
                </div>
              </div>

              {/* Review Page */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">智能复习</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['Space']} desc="翻转卡片" />
                  <ShortcutItem keys={['1-5']} desc="评分（1完全忘记-5完美）" />
                  <ShortcutItem keys={['P']} desc="播放发音" />
                  <ShortcutItem keys={['Tab']} desc="切换识记/拼写模式" />
                  <ShortcutItem keys={['H']} desc="显示拼写提示" />
                </div>
              </div>

              {/* Word List */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">单词列表</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['↑', '↓']} desc="选择单词" />
                  <ShortcutItem keys={['Enter']} desc="查看详情" />
                  <ShortcutItem keys={['Delete']} desc="删除单词" />
                  <ShortcutItem keys={['M']} desc="标记已掌握" />
                  <ShortcutItem keys={['/']} desc="快速搜索" />
                </div>
              </div>

              {/* Add Word */}
              <div>
                <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">词汇中心</h4>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutItem keys={['Ctrl', 'Enter']} desc="添加到生词本" />
                  <ShortcutItem keys={['Ctrl', 'G']} desc="AI生成例句" />
                  <ShortcutItem keys={['Ctrl', 'P']} desc="播放发音" />
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
      <AppContent />
    </ThemeProvider>
  )
}

export default App
