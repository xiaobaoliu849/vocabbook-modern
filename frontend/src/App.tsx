import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import AddWord from './pages/AddWord'
import WordList from './pages/WordList'
import Review from './pages/Review'
import Settings from './pages/Settings'
import './App.css'

type Page = 'add' | 'list' | 'review' | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('add')
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const renderPage = () => {
    switch (currentPage) {
      case 'add':
        return <AddWord />
      case 'list':
        return <WordList />
      case 'review':
        return <Review />
      case 'settings':
        return <Settings isDark={isDark} setIsDark={setIsDark} />
      default:
        return <AddWord />
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}

export default App
