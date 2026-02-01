import { useState, useEffect, useRef, useCallback } from 'react'
import WordDetailModal from '../components/WordDetailModal'
import AudioButton from '../components/AudioButton'
import { Trash2, CheckCircle, BookOpen, Loader2, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface Word {
    id: number
    word: string
    phonetic: string
    meaning: string
    example: string
    roots: string
    synonyms: string
    mastered: boolean
    next_review_time: number
    tags: string
    date_added: string
    review_count: number
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

export default function WordList({ isActive }: { isActive?: boolean }) {
    const [words, setWords] = useState<Word[]>([])
    const [loading, setLoading] = useState(true)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [filterTag, setFilterTag] = useState('')
    const [allTags, setAllTags] = useState<string[]>([])
    const [selectedWord, setSelectedWord] = useState<Word | null>(null)
    const [selectedIndex, setSelectedIndex] = useState(-1)

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(20)
    const [totalItems, setTotalItems] = useState(0)

    const searchInputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Computed pagination values
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1

    useEffect(() => {
        if (isActive !== false) {
            fetchWords()
            fetchTags()
        }
    }, [searchKeyword, filterTag, isActive, currentPage, itemsPerPage])

    const fetchWords = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (searchKeyword) params.append('keyword', searchKeyword)
            if (filterTag) params.append('tag', filterTag)
            params.append('page', currentPage.toString())
            params.append('page_size', itemsPerPage.toString())
            params.append('_t', Date.now().toString()) // Prevent caching

            const response = await fetch(`http://localhost:8000/api/words?${params}`)
            if (response.ok) {
                const data = await response.json()
                setWords(data.words || [])
                setTotalItems(data.total || 0)
            }
        } catch (error) {
            console.error('Failed to fetch words:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchTags = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/words/tags')
            if (response.ok) {
                const data = await response.json()
                setAllTags(data.tags || [])
            }
        } catch (error) {
            console.error('Failed to fetch tags:', error)
        }
    }

    const handleDelete = async (word: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(`确定要删除 "${word}" 吗？`)) return

        try {
            const response = await fetch(`http://localhost:8000/api/words/${encodeURIComponent(word)}`, {
                method: 'DELETE'
            })
            if (response.ok) {
                setWords(words.filter(w => w.word !== word))
                if (selectedWord?.word === word) setSelectedWord(null)
            }
        } catch (error) {
            console.error('Failed to delete word:', error)
        }
    }

    const handleMarkMastered = async (word: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            const response = await fetch(`http://localhost:8000/api/words/${encodeURIComponent(word)}/master`, {
                method: 'POST'
            })
            if (response.ok) {
                setWords(words.map(w =>
                    w.word === word ? { ...w, mastered: true } : w
                ))
            }
        } catch (error) {
            console.error('Failed to mark mastered:', error)
        }
    }

    const getStatusBadge = (word: Word) => {
        if (word.mastered) {
            return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">已掌握</span>
        }
        const now = Date.now() / 1000
        if (word.next_review_time <= now) {
            return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">待复习</span>
        }
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">学习中</span>
    }

    // Scroll selected item into view
    const scrollToSelected = useCallback((index: number) => {
        if (listRef.current) {
            const items = listRef.current.querySelectorAll('[data-word-item]')
            if (items[index]) {
                items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            }
        }
    }, [])

    // Keyboard navigation
    useEffect(() => {
        if (!isActive) return

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

            // Focus search with / (when not in input)
            if (e.key === '/' && !isInput) {
                e.preventDefault()
                searchInputRef.current?.focus()
                return
            }

            // Escape blurs search input
            if (e.key === 'Escape' && isInput) {
                (target as HTMLInputElement).blur()
                return
            }

            // Other keyboard shortcuts only work when not in input
            if (isInput) return

            // Arrow navigation
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => {
                    const newIndex = prev < words.length - 1 ? prev + 1 : prev
                    scrollToSelected(newIndex)
                    return newIndex
                })
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => {
                    const newIndex = prev > 0 ? prev - 1 : 0
                    scrollToSelected(newIndex)
                    return newIndex
                })
            } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < words.length) {
                // Open detail modal
                e.preventDefault()
                setSelectedWord(words[selectedIndex])
            } else if (e.key === 'Delete' && selectedIndex >= 0 && selectedIndex < words.length) {
                // Delete selected word
                e.preventDefault()
                const word = words[selectedIndex]
                if (confirm(`确定要删除 "${word.word}" 吗？`)) {
                    fetch(`http://localhost:8000/api/words/${encodeURIComponent(word.word)}`, { method: 'DELETE' })
                        .then(response => {
                            if (response.ok) {
                                setWords(prev => prev.filter(w => w.word !== word.word))
                                setSelectedIndex(prev => Math.min(prev, words.length - 2))
                            }
                        })
                }
            } else if ((e.key === 'm' || e.key === 'M') && selectedIndex >= 0 && selectedIndex < words.length) {
                // Mark as mastered
                e.preventDefault()
                const word = words[selectedIndex]
                if (!word.mastered) {
                    fetch(`http://localhost:8000/api/words/${encodeURIComponent(word.word)}/master`, { method: 'POST' })
                        .then(response => {
                            if (response.ok) {
                                setWords(prev => prev.map(w => w.word === word.word ? { ...w, mastered: true } : w))
                            }
                        })
                }
            } else if (e.key === 'p' || e.key === 'P') {
                // Play audio for selected word
                if (selectedIndex >= 0 && selectedIndex < words.length) {
                    e.preventDefault()
                    const word = words[selectedIndex]
                    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word.word}&type=2`)
                    audio.play().catch(err => console.warn('Audio play failed:', err))
                }
            } else if (e.key === 'ArrowLeft') {
                // Previous page
                e.preventDefault()
                setCurrentPage(prev => Math.max(1, prev - 1))
            } else if (e.key === 'ArrowRight') {
                // Next page
                e.preventDefault()
                setCurrentPage(prev => Math.min(totalPages, prev + 1))
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isActive, words, selectedIndex, scrollToSelected, totalPages])

    // Reset selection and page when filters change
    useEffect(() => {
        setSelectedIndex(-1)
        setCurrentPage(1)
    }, [searchKeyword, filterTag])

    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
                        单词列表
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        共 {totalItems} 个单词 {totalPages > 1 && `· 第 ${currentPage}/${totalPages} 页`}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4 flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="搜索单词或释义... (按 / 聚焦)"
                        className="input-field w-full pl-9"
                    />
                </div>
                <select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="input-field w-auto"
                >
                    <option value="">全部标签</option>
                    {allTags.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                    ))}
                </select>
            </div>

            {/* Word List */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                        <div className="animate-pulse">正在整理词库...</div>
                    </div>
                ) : words.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600 opacity-50" />
                        <p className="text-lg">暂无单词，去添加一些吧！</p>
                    </div>
                ) : (
                    <div ref={listRef} className="divide-y divide-slate-200 dark:divide-slate-700">
                        {words.map((word, index) => (
                            <div
                                key={word.id}
                                data-word-item
                                onClick={() => {
                                    setSelectedIndex(index)
                                    setSelectedWord(word)
                                }}
                                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 
                           transition-colors animate-slide-up cursor-pointer group
                           ${selectedIndex === index ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-inset ring-primary-500' : ''}`}
                                style={{ animationDelay: `${index * 0.02}s` }}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                {word.word}
                                            </h3>
                                            <span className="text-slate-400">{word.phonetic}</span>
                                            {getStatusBadge(word)}
                                            {word.tags && word.tags.split(',').map(tag => tag.trim() && (
                                                <span
                                                    key={tag}
                                                    className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 
                                     text-slate-600 dark:text-slate-300"
                                                >
                                                    {tag.trim()}
                                                </span>
                                            ))}
                                        </div>
                                        <p className="text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                            {word.meaning}
                                        </p>
                                    </div>

                                    <div className="flex gap-2 ml-4">
                                        <AudioButton word={word.word} />
                                        {!word.mastered && (
                                            <button
                                                onClick={(e) => handleMarkMastered(word.word, e)}
                                                className="p-2 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 
                                   transition-all text-slate-400 hover:text-green-600 hover:scale-110 active:scale-95"
                                                title="标记为已掌握"
                                            >
                                                <CheckCircle size={20} />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => handleDelete(word.word, e)}
                                            className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 
                                 transition-all text-slate-400 hover:text-red-600 hover:scale-110 active:scale-95"
                                            title="删除"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedWord && (
                <WordDetailModal
                    word={selectedWord}
                    onClose={() => setSelectedWord(null)}
                />
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 dark:text-slate-400">每页显示</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value))
                                setCurrentPage(1)
                            }}
                            className="input-field w-auto py-1.5 px-2 text-sm"
                        >
                            {PAGE_SIZE_OPTIONS.map(size => (
                                <option key={size} value={size}>{size} 个</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="第一页"
                        >
                            <ChevronsLeft size={18} />
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="上一页 (←)"
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <div className="flex items-center gap-1 px-2">
                            {/* Page number buttons */}
                            {(() => {
                                const pages: (number | string)[] = []
                                const showPages = 5
                                let start = Math.max(1, currentPage - Math.floor(showPages / 2))
                                let end = Math.min(totalPages, start + showPages - 1)
                                start = Math.max(1, end - showPages + 1)

                                if (start > 1) {
                                    pages.push(1)
                                    if (start > 2) pages.push('...')
                                }
                                for (let i = start; i <= end; i++) {
                                    pages.push(i)
                                }
                                if (end < totalPages) {
                                    if (end < totalPages - 1) pages.push('...')
                                    pages.push(totalPages)
                                }

                                return pages.map((page, idx) => (
                                    typeof page === 'number' ? (
                                        <button
                                            key={idx}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                                                ${currentPage === page
                                                    ? 'bg-primary-500 text-white'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                                        >
                                            {page}
                                        </button>
                                    ) : (
                                        <span key={idx} className="px-1 text-slate-400">…</span>
                                    )
                                ))
                            })()}
                        </div>

                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="下一页 (→)"
                        >
                            <ChevronRight size={18} />
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="最后一页"
                        >
                            <ChevronsRight size={18} />
                        </button>
                    </div>

                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        共 {totalItems} 个单词 · 按 ← → 翻页
                    </div>
                </div>
            )}
        </div>
    )
}
