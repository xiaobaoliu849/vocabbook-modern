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

  useEffect(() => {
    const handleSearchWord = () => {
      setCurrentPage('add')
    }
    window.addEventListener('search-word', handleSearchWord)
    return () => window.removeEventListener('search-word', handleSearchWord)
  }, [])

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
          <div className={currentPage === 'review' ? '' : 'hidden'}><Review /></div>
          <div className={currentPage === 'settings' ? '' : 'hidden'}>
            <Settings />
          </div>
        </div>
      </main>
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
