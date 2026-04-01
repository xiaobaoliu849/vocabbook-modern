import { useState, useEffect, useRef, useCallback } from 'react'
import WordDetailModal from '../components/WordDetailModal'
import AudioButton from '../components/AudioButton'
import { Trash2, CheckCircle, BookOpen, Loader2, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useDebounce } from '../utils/performance'
import { api, API_PATHS } from '../utils/api'
import { useGlobalState } from '../context/GlobalStateContext'
import { useShortcuts } from '../context/ShortcutContext'
import { useTranslation } from 'react-i18next'

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
    const { t } = useTranslation()
    const { matches } = useShortcuts()
    const [words, setWords] = useState<Word[]>([])
    const [loading, setLoading] = useState(true)
    const [isFetching, setIsFetching] = useState(false)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [filterTag, setFilterTag] = useState('')
    const [allTags, setAllTags] = useState<string[]>([])
    const [selectedWord, setSelectedWord] = useState<Word | null>(null)
    const [selectedIndex, setSelectedIndex] = useState(-1)

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage, setItemsPerPage] = useState(20)
    const [totalItems, setTotalItems] = useState(0)

    const { notifyWordDeleted, notifyWordUpdated, lastUpdate } = useGlobalState()

    // 使用防抖的搜索关键词 (300ms 延迟)
    const debouncedKeyword = useDebounce(searchKeyword, 300)

    const searchInputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const hasFetchedOnceRef = useRef(false)
    const getDeleteConfirmMessage = useCallback((word: string) => t('wordList.confirmDelete', { word }), [t])

    // Computed pagination values
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1

    const fetchWords = useCallback(async (signal?: AbortSignal) => {
        setIsFetching(true)
        if (!hasFetchedOnceRef.current) {
            setLoading(true)
        }
        try {
            const params = new URLSearchParams()
            if (debouncedKeyword) params.append('keyword', debouncedKeyword)
            if (filterTag) params.append('tag', filterTag)
            params.append('page', currentPage.toString())
            params.append('page_size', itemsPerPage.toString())
            params.append('_t', Date.now().toString())

            const data = await api.get(`${API_PATHS.WORDS}?${params}`, { signal })
            setWords(data.words || [])
            setTotalItems(data.total || 0)
            hasFetchedOnceRef.current = true
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return
            }
            console.error('Failed to fetch words:', error)
        } finally {
            if (!signal?.aborted) {
                setLoading(false)
                setIsFetching(false)
            }
        }
    }, [currentPage, debouncedKeyword, filterTag, itemsPerPage])

    const fetchTags = useCallback(async () => {
        try {
            const data = await api.get(API_PATHS.WORD_TAGS)
            setAllTags(data.tags || [])
        } catch (error) {
            console.error('Failed to fetch tags:', error)
        }
    }, [])

    useEffect(() => {
        if (isActive === false) return

        const controller = new AbortController()
        void fetchWords(controller.signal)

        return () => controller.abort()
    }, [fetchWords, isActive, lastUpdate])

    useEffect(() => {
        if (isActive !== false) {
            void fetchTags()
        }
    }, [fetchTags, isActive, lastUpdate])

    const handleDelete = useCallback(async (word: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(getDeleteConfirmMessage(word))) return

        try {
            await api.delete(API_PATHS.WORD(word))
            setWords(prev => prev.filter(w => w.word !== word))
            if (selectedWord?.word === word) setSelectedWord(null)
            notifyWordDeleted()
        } catch (error) {
            console.error('Failed to delete word:', error)
        }
    }, [getDeleteConfirmMessage, notifyWordDeleted, selectedWord?.word])

    const handleMarkMastered = useCallback(async (word: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await api.post(API_PATHS.WORD_MASTER(word))
            setWords(prev => prev.map(w =>
                w.word === word ? { ...w, mastered: true } : w
            ))
            notifyWordUpdated()
        } catch (error) {
            console.error('Failed to mark mastered:', error)
        }
    }, [notifyWordUpdated])

    const getStatusBadge = (word: Word) => {
        if (word.mastered) {
            return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('wordList.status.mastered')}</span>
        }
        const now = Date.now() / 1000
        if (word.next_review_time <= now) {
            return <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{t('wordList.status.review')}</span>
        }
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{t('wordList.status.learning')}</span>
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
            if (matches(e, 'list.focusSearch') && !isInput) {
                e.preventDefault()
                searchInputRef.current?.focus()
                return
            }

            // Escape blurs search input
            if (matches(e, 'common.closeDialog') && isInput) {
                (target as HTMLInputElement).blur()
                return
            }

            // Other keyboard shortcuts only work when not in input
            if (isInput) return

            // Arrow navigation
            if (matches(e, 'list.selectNext')) {
                e.preventDefault()
                setSelectedIndex(prev => {
                    const newIndex = prev < words.length - 1 ? prev + 1 : prev
                    scrollToSelected(newIndex)
                    return newIndex
                })
            } else if (matches(e, 'list.selectPrevious')) {
                e.preventDefault()
                setSelectedIndex(prev => {
                    const newIndex = prev > 0 ? prev - 1 : 0
                    scrollToSelected(newIndex)
                    return newIndex
                })
            } else if (matches(e, 'list.viewDetails') && selectedIndex >= 0 && selectedIndex < words.length) {
                // Open detail modal
                e.preventDefault()
                setSelectedWord(words[selectedIndex])
            } else if (matches(e, 'list.deleteWord') && selectedIndex >= 0 && selectedIndex < words.length) {
                // Delete selected word
                e.preventDefault()
                const word = words[selectedIndex]
                if (confirm(getDeleteConfirmMessage(word.word))) {
                    api.delete(API_PATHS.WORD(word.word))
                        .then(() => {
                            setWords(prev => prev.filter(w => w.word !== word.word))
                            setSelectedIndex(prev => Math.min(prev, words.length - 2))
                            notifyWordDeleted()
                        })
                        .catch(err => console.error('Failed to delete word:', err))
                }
            } else if (matches(e, 'list.markMastered') && selectedIndex >= 0 && selectedIndex < words.length) {
                // Mark as mastered
                e.preventDefault()
                const word = words[selectedIndex]
                if (!word.mastered) {
                    api.post(API_PATHS.WORD_MASTER(word.word))
                        .then(() => {
                            setWords(prev => prev.map(w => w.word === word.word ? { ...w, mastered: true } : w))
                            notifyWordUpdated()
                        })
                        .catch(err => console.error('Failed to mark mastered:', err))
                }
            } else if (matches(e, 'list.playAudio')) {
                // Play audio for selected word
                if (selectedIndex >= 0 && selectedIndex < words.length) {
                    e.preventDefault()
                    const word = words[selectedIndex]
                    const accent = (localStorage.getItem('preferred_accent') || 'us') === 'uk' ? '1' : '2'
                    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word.word}&type=${accent}`)
                    audio.play().catch(err => console.warn('Audio play failed:', err))
                }
            } else if (matches(e, 'list.previousPage')) {
                // Previous page
                e.preventDefault()
                if (e.repeat || isFetching) return
                setCurrentPage(prev => Math.max(1, prev - 1))
            } else if (matches(e, 'list.nextPage')) {
                // Next page
                e.preventDefault()
                if (e.repeat || isFetching) return
                setCurrentPage(prev => Math.min(totalPages, prev + 1))
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [getDeleteConfirmMessage, handleDelete, handleMarkMastered, isActive, isFetching, matches, notifyWordDeleted, notifyWordUpdated, scrollToSelected, selectedIndex, totalPages, words])

    // Reset selection and page when filters change
    useEffect(() => {
        setSelectedIndex(-1)
        setCurrentPage(1)
    }, [searchKeyword, filterTag])

    useEffect(() => {
        if (!listRef.current) return
        listRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }, [currentPage, itemsPerPage])

    return (
        <div className="animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
                        {t('wordList.title')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {t('wordList.totalWords', { count: totalItems })}
                        {totalPages > 1 && ` · ${t('wordList.pageInfo', { current: currentPage, total: totalPages })}`}
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
                        placeholder={t('wordList.searchPlaceholder')}
                        className="input-field w-full pl-9"
                    />
                </div>
                <select
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="input-field w-auto"
                >
                    <option value="">{t('wordList.allTags')}</option>
                    {allTags.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                    ))}
                </select>
            </div>

            {/* Word List */}
            <div className="glass-card relative overflow-hidden">
                {loading && words.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                        <div className="animate-pulse">{t('wordList.loading')}</div>
                    </div>
                ) : words.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600 opacity-50" />
                        <p className="text-lg">{t('wordList.empty')}</p>
                    </div>
                ) : (
                    <div ref={listRef} className="divide-y divide-slate-200 dark:divide-slate-700 max-h-[70vh] overflow-y-auto">
                        {words.map((word, index) => (
                            <div
                                key={word.id}
                                data-word-item
                                onClick={() => {
                                    setSelectedIndex(index)
                                    setSelectedWord(word)
                                }}
                                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 
                           transition-colors cursor-pointer group
                           ${index === 0 ? 'rounded-t-3xl' : ''}
                           ${index === words.length - 1 ? 'rounded-b-3xl' : ''}
                           ${selectedIndex === index ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-inset ring-primary-500' : ''}`}
                            >
                                <div className="flex items-start justify-between w-full">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                {word.word}
                                            </h3>
                                            {word.phonetic && <span className="text-slate-400">{word.phonetic}</span>}
                                            {getStatusBadge(word)}
                                            <div className="flex flex-wrap gap-1">
                                                {word.tags && word.tags.split(',').map((tag, idx) => tag.trim() && (
                                                    <span
                                                        key={idx}
                                                        className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 
                                         text-slate-600 dark:text-slate-300"
                                                    >
                                                        {tag.trim()}
                                                    </span>
                                                ))}
                                            </div>
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
                                                title={t('wordList.actions.markMastered')}
                                            >
                                                <CheckCircle size={20} />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => handleDelete(word.word, e)}
                                            className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 
                                 transition-all text-slate-400 hover:text-red-600 hover:scale-110 active:scale-95"
                                            title={t('wordList.actions.delete')}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {isFetching && words.length > 0 && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />
                            {t('wordList.loading')}
                        </div>
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
                        <span className="text-sm text-slate-500 dark:text-slate-400">{t('wordList.pagination.itemsPerPage')}</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value))
                                setCurrentPage(1)
                            }}
                            disabled={isFetching}
                            className="input-field w-auto py-1.5 px-2 text-sm"
                        >
                            {PAGE_SIZE_OPTIONS.map(size => (
                                <option key={size} value={size}>{t('wordList.pagination.option', { count: size })}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1 || isFetching}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('wordList.pagination.first')}
                        >
                            <ChevronsLeft size={18} />
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1 || isFetching}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('wordList.pagination.previous')}
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <div className="flex items-center gap-1 px-2">
                            {/* Page number buttons */}
                            {(() => {
                                const pages: (number | string)[] = []
                                const showPages = 5
                                let start = Math.max(1, currentPage - Math.floor(showPages / 2))
                                const end = Math.min(totalPages, start + showPages - 1)
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
                                            disabled={isFetching}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                                                ${currentPage === page
                                                    ? 'bg-primary-500 text-white'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}
                                                ${isFetching ? ' disabled:cursor-not-allowed disabled:opacity-50' : ''}`}
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
                            disabled={currentPage === totalPages || isFetching}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('wordList.pagination.next')}
                        >
                            <ChevronRight size={18} />
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages || isFetching}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 
                                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title={t('wordList.pagination.last')}
                        >
                            <ChevronsRight size={18} />
                        </button>
                    </div>

                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        {t('wordList.pagination.hint', { count: totalItems })}
                    </div>
                </div>
            )}
        </div>
    )
}
