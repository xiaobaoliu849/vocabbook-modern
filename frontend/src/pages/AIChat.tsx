import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Trash2, Sparkles, Plus, MessageSquare, Menu, Edit2, MoreHorizontal, Eraser, ChevronRight, Paperclip, X, Languages } from 'lucide-react'
import { API_PATHS, API_BASE_URL, getClientId } from '../utils/api'
import AudioButton from '../components/AudioButton'
import EvermemLogo from '../assets/evermind-powered.svg'
import { useAuth } from '../context/AuthContext'
import { useChatSessionSync } from '../hooks/useChatSessionSync'

const generateId = () => {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
};

const CHAT_SCOPE_SEPARATOR = '::'

const normalizeScopeValue = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return normalized || 'guest'
}

const resolveChatScope = (token?: string | null) => {
    if (!token) return 'guest'

    try {
        const payload = token.split('.')[1]
        if (!payload) return 'guest'
        const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/')
        const decoded = JSON.parse(atob(padded))
        const sub = typeof decoded?.sub === 'string' ? decoded.sub.trim() : ''
        if (!sub) return 'guest'
        return `cloud_${normalizeScopeValue(sub)}`
    } catch {
        return 'guest'
    }
}

const getScopedStorageKey = (scope: string) => `chat_sessions_${scope}`
const buildScopedSessionId = (scope: string) => `${scope}${CHAT_SCOPE_SEPARATOR}${generateId()}`
const isSessionInScope = (sessionId: string, scope: string) => sessionId.startsWith(`${scope}${CHAT_SCOPE_SEPARATOR}`)
const DEFAULT_NEW_CHAT_TITLE = '__NEW_CHAT__'
const LEGACY_NEW_CHAT_TITLE = 'New Chat'
const LEGACY_MIGRATED_CHAT_TITLE = 'Migrated Chat'
const isDefaultNewChatTitle = (title: string) => title === DEFAULT_NEW_CHAT_TITLE || title === LEGACY_NEW_CHAT_TITLE

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    attachments?: ImageAttachment[]
    timestamp: number
    memoriesUsed?: number
    memorySaved?: boolean
    reasoningContent?: string
}

interface ImageAttachment {
    id: string
    name: string
    dataUrl: string
    mediaType: string
    size: number
}

interface ChatSession {
    id: string
    title: string
    messages: Message[]
    updatedAt: number
    createdAt: number
}

interface MemoryOverview {
    enabled: boolean
    requested: boolean
    requires_auth: boolean
    available: boolean
    profile_facts: string[]
    recent_memories: Array<{
        content: string
        timestamp?: string
        bucket: 'chat' | 'review' | string
    }>
    review_focus: {
        due_count: number
        difficult_count: number
        weak_words: Array<{
            word: string
            meaning: string
            error_count: number
            easiness: number
            is_due: boolean
        }>
    }
    suggestions: string[]
}

export default function AIChat({ isActive, onOpenTranslation }: { isActive?: boolean, onOpenTranslation?: () => void }) {
    const { t } = useTranslation()
    const { token } = useAuth()
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [isInitialized, setIsInitialized] = useState(false)
    const [chatScope, setChatScope] = useState(() => resolveChatScope(token))
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const isNearBottomRef = useRef(true)
    const wasActiveRef = useRef(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Config state
    const [provider, setProvider] = useState('')
    const [model, setModel] = useState('')
    const [evermemEnabled, setEvermemEnabled] = useState(false)

    // Memory activity toast
    const [memoryToast, setMemoryToast] = useState<string | null>(null)
    const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})
    const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([])
    const [isDragOverComposer, setIsDragOverComposer] = useState(false)
    const [memoryPanelOpen, setMemoryPanelOpen] = useState(false)
    const [memoryOverview, setMemoryOverview] = useState<MemoryOverview | null>(null)
    const [memoryOverviewLoading, setMemoryOverviewLoading] = useState(false)
    const [memoryOverviewError, setMemoryOverviewError] = useState<string | null>(null)
    const [memoryOverviewUpdatedAt, setMemoryOverviewUpdatedAt] = useState<number | null>(null)

    const memoryOverviewRequestRef = useRef<Promise<void> | null>(null)
    const memoryOverviewLastFetchedAtRef = useRef<number>(0)
    const memoryOverviewDirtyRef = useRef(false)
    const memoryOverviewRefreshTimerRef = useRef<number | null>(null)

    const MAX_IMAGE_ATTACHMENTS = 3
    const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024

    const getCommonHeaders = useCallback(() => {
        const headers: Record<string, string> = {
            'X-Client-Id': getClientId()
        }
        if (token) headers['Authorization'] = `Bearer ${token}`
        return headers
    }, [token])

    const {
        clear: clearQueuedSessionSyncs,
        drop: dropQueuedSessionSync,
        flush: flushSessionSyncs,
        schedule: scheduleQueuedSessionSync,
    } = useChatSessionSync(API_BASE_URL, API_PATHS.AI_CHAT_SESSIONS)

    const scheduleSessionSync = useCallback((
        session: ChatSession,
        options?: { immediate?: boolean }
    ) => {
        scheduleQueuedSessionSync(session, getCommonHeaders(), options)
    }, [getCommonHeaders, scheduleQueuedSessionSync])

    const loadConfig = useCallback(() => {
        const currentProvider = localStorage.getItem('ai_provider') || 'dashscope'
        setProvider(currentProvider)

        const savedModelsStr = localStorage.getItem('ai_models_map')
        let modelsMap: Record<string, string> = {}
        if (savedModelsStr) {
            try {
                modelsMap = JSON.parse(savedModelsStr)
            } catch {
                // Ignore malformed saved model config.
            }
        }
        setModel(modelsMap[currentProvider] || localStorage.getItem('ai_model') || '')
        setEvermemEnabled(localStorage.getItem('evermem_enabled') === 'true')
    }, [])

    const scrollToBottom = useCallback((instant: boolean = false, force: boolean = false) => {
        if (!force && !isNearBottomRef.current) return
        messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' })
    }, [])

    const handleMessagesScroll = useCallback(() => {
        const el = messagesContainerRef.current
        if (!el) return
        const threshold = 120
        isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    }, [])

    const createNewSession = useCallback(() => {
        const existingEmptySession = sessions.find(
            session => session.messages.length === 0 && isDefaultNewChatTitle(session.title)
        )
        if (existingEmptySession) {
            setActiveSessionId(existingEmptySession.id)
            setSidebarOpen(false)
            return
        }

        const newSession: ChatSession = {
            id: buildScopedSessionId(chatScope),
            title: DEFAULT_NEW_CHAT_TITLE,
            messages: [],
            updatedAt: Date.now(),
            createdAt: Date.now()
        }
        setSessions(prev => [newSession, ...prev])
        setActiveSessionId(newSession.id)
        setSidebarOpen(false)
        scheduleSessionSync(newSession)
    }, [chatScope, scheduleSessionSync, sessions])

    // Load sessions from API and fallback to local storage (scoped by current auth user)
    useEffect(() => {
        let cancelled = false
        const loadInitialData = async () => {
            let loadedSessions: ChatSession[] = []
            let loadedFromFallback = false

            setIsInitialized(false)
            setSessions([])
            setActiveSessionId(null)

            try {
                // Try to load from Backend API
                const response = await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSIONS}`, {
                    headers: getCommonHeaders()
                })
                if (response.ok) {
                    const dbSessions = await response.json()
                    if (Array.isArray(dbSessions) && dbSessions.length > 0) {
                        loadedSessions = dbSessions.filter((s: ChatSession) => isSessionInScope(s.id, chatScope))
                    }
                }
            } catch (err) {
                console.error("Failed to load chat sessions from API", err)
            }

            // Fallback to localStorage if API empty or failed
            if (loadedSessions.length === 0) {
                const savedSessions = localStorage.getItem(getScopedStorageKey(chatScope))
                if (savedSessions) {
                    try {
                        loadedSessions = JSON.parse(savedSessions)
                        loadedFromFallback = loadedSessions.length > 0
                    } catch (error) {
                        console.error("Failed to load chat sessions from localStorage", error)
                    }
                }
            }

            // Only migrate legacy shared local keys for guest scope.
            if (chatScope === 'guest' && loadedSessions.length === 0) {
                const legacySessions = localStorage.getItem('chat_sessions')
                if (legacySessions) {
                    try {
                        const parsed = JSON.parse(legacySessions)
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            loadedSessions = parsed.map((s: ChatSession) => ({
                                ...s,
                                id: isSessionInScope(s.id, chatScope) ? s.id : buildScopedSessionId(chatScope)
                            }))
                            loadedFromFallback = true
                        }
                    } catch {
                        // Ignore malformed legacy payload
                    }
                }
            }

            if (chatScope === 'guest' && loadedSessions.length === 0) {
                const oldHistory = localStorage.getItem('chat_history')
                if (oldHistory) {
                    try {
                        const parsedMessages = JSON.parse(oldHistory)
                        if (parsedMessages.length > 0) {
                            loadedSessions = [{
                                id: buildScopedSessionId(chatScope),
                                title: LEGACY_MIGRATED_CHAT_TITLE,
                                messages: parsedMessages,
                                updatedAt: Date.now(),
                                createdAt: Date.now()
                            }]
                            loadedFromFallback = true
                        }
                    } catch {
                        // Ignore malformed legacy history.
                    }
                }
            }

            if (cancelled) return

            if (loadedSessions.length > 0) {
                setSessions(loadedSessions)
                setActiveSessionId(loadedSessions[0].id)

                // Sync to DB if we loaded from LocalStorage fallback
                if (loadedFromFallback) {
                    try {
                        for (const session of loadedSessions) {
                            scheduleSessionSync(session)
                        }
                        await flushSessionSyncs()
                    } catch {
                        // Best-effort sync only.
                    }
                }
            }

            setIsInitialized(true)
        }

        loadInitialData()
        return () => { cancelled = true }
    }, [chatScope, flushSessionSyncs, getCommonHeaders, scheduleSessionSync, token])

    useEffect(() => {
        if (isActive) {
            const nextScope = resolveChatScope(token)
            if (nextScope !== chatScope) {
                wasActiveRef.current = false
                setChatScope(nextScope)
                return
            }
            loadConfig()
            scrollToBottom()
        }
    }, [chatScope, isActive, loadConfig, scrollToBottom, token])

    // Entering AI chat starts a fresh session for the current account scope.
    useEffect(() => {
        if (!isActive) {
            wasActiveRef.current = false
            return
        }
        if (!isInitialized || wasActiveRef.current) return
        wasActiveRef.current = true

        const active = sessions.find(s => s.id === activeSessionId)
        if (!active || active.messages.length > 0) {
            createNewSession()
        }
    }, [activeSessionId, createNewSession, isActive, isInitialized, sessions])

    useEffect(() => {
        if (!isInitialized) return
        const scopedStorageKey = getScopedStorageKey(chatScope)
        if (sessions.length > 0) {
            localStorage.setItem(scopedStorageKey, JSON.stringify(sessions))
        } else {
            localStorage.removeItem(scopedStorageKey)
        }
    }, [sessions, isInitialized, chatScope])

    // Scroll to bottom when active session or its messages change
    const activeMessageCount = sessions.find(s => s.id === activeSessionId)?.messages.length ?? 0

    useEffect(() => {
        scrollToBottom(false, true)
    }, [activeMessageCount, activeSessionId, scrollToBottom])

    // Auto-hide memory toast
    useEffect(() => {
        if (memoryToast) {
            const t = setTimeout(() => setMemoryToast(null), 3000)
            return () => clearTimeout(t)
        }
    }, [memoryToast])

    const buildMessagePayload = (message: Message) => {
        if (message.role !== 'user' || !message.attachments || message.attachments.length === 0) {
            return message.content
        }

        const parts: Array<Record<string, unknown>> = []
        if (message.content.trim()) {
            parts.push({ type: 'text', text: message.content })
        }
        for (const attachment of message.attachments) {
            parts.push({
                type: 'image_url',
                image_url: {
                    url: attachment.dataUrl
                }
            })
        }
        return parts.length > 0 ? parts : message.content
    }

    const readImageFile = (file: File): Promise<ImageAttachment> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : ''
                if (!result) {
                    reject(new Error('Failed to read image'))
                    return
                }
                resolve({
                    id: generateId(),
                    name: file.name,
                    dataUrl: result,
                    mediaType: file.type || 'image/png',
                    size: file.size,
                })
            }
            reader.onerror = () => reject(new Error('Failed to read image'))
            reader.readAsDataURL(file)
        })
    }

    const addImageFiles = async (files: File[]) => {
        if (files.length === 0) return

        const imageFiles = files.filter(file => file.type.startsWith('image/'))
        if (imageFiles.length !== files.length) {
            window.alert(t('chat.attachments.onlyImages'))
        }

        const availableSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - pendingImages.length)
        if (availableSlots <= 0) {
            window.alert(t('chat.attachments.maxImages', { count: MAX_IMAGE_ATTACHMENTS }))
            return
        }

        const nextFiles = imageFiles.slice(0, availableSlots)
        if (imageFiles.length > availableSlots) {
            window.alert(t('chat.attachments.firstImagesOnly', { count: availableSlots }))
        }

        try {
            const oversized = nextFiles.find(file => file.size > MAX_IMAGE_SIZE_BYTES)
            if (oversized) {
                window.alert(t('chat.attachments.fileTooLarge', { name: oversized.name }))
                return
            }

            const attachments = await Promise.all(nextFiles.map(readImageFile))
            setPendingImages(prev => [...prev, ...attachments])
        } catch (error) {
            console.error('Failed to load image attachments', error)
            window.alert(t('chat.attachments.loadFailed'))
        }
    }

    const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputElement = event.currentTarget
        const files = Array.from(event.target.files || [])
        try {
            await addImageFiles(files)
        } finally {
            inputElement.value = ''
        }
    }

    const handleComposerPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboardFiles = Array.from(event.clipboardData?.files || [])
        const imageFiles = clipboardFiles.filter(file => file.type.startsWith('image/'))
        if (imageFiles.length === 0) return

        event.preventDefault()
        await addImageFiles(imageFiles)
    }

    const handleComposerDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setIsDragOverComposer(false)
        const droppedFiles = Array.from(event.dataTransfer?.files || [])
        await addImageFiles(droppedFiles)
    }

    const removePendingImage = (attachmentId: string) => {
        setPendingImages(prev => prev.filter(item => item.id !== attachmentId))
    }

    const getApiHeaders = useCallback(() => {
        const headers: Record<string, string> = getCommonHeaders()
        if (provider) headers['X-AI-Provider'] = provider
        if (model) headers['X-AI-Model'] = model

        const savedBasesStr = localStorage.getItem('ai_bases_map')
        let basesMap: Record<string, string> = {}
        if (savedBasesStr) {
            try {
                basesMap = JSON.parse(savedBasesStr)
            } catch {
                // Ignore malformed saved base config.
            }
        }
        const apiBase = basesMap[provider] || ''
        if (apiBase) headers['X-AI-Base'] = apiBase

        const savedKeysStr = localStorage.getItem('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch {
                // Ignore malformed saved key config.
            }
        }
        const apiKey = keysMap[provider] || localStorage.getItem('ai_api_key') || ''
        if (apiKey) headers['X-AI-Key'] = apiKey

        if (evermemEnabled) {
            headers['X-EverMem-Enabled'] = 'true'
            const evermemUrl = localStorage.getItem('evermem_url')
            const evermemKey = localStorage.getItem('evermem_key')
            if (evermemUrl) headers['X-EverMem-Url'] = evermemUrl
            if (evermemKey) headers['X-EverMem-Key'] = evermemKey
        }
        return headers
    }, [evermemEnabled, getCommonHeaders, model, provider])

    const loadMemoryOverview = useCallback(async (
        options?: {
            force?: boolean
            silent?: boolean
        }
    ) => {
        if (!evermemEnabled) {
            setMemoryOverview(null)
            setMemoryOverviewError(null)
            setMemoryOverviewUpdatedAt(null)
            memoryOverviewLastFetchedAtRef.current = 0
            memoryOverviewDirtyRef.current = false
            return
        }

        const force = options?.force === true
        const silent = options?.silent === true
        const now = Date.now()
        const isFresh = now - memoryOverviewLastFetchedAtRef.current < 60_000

        if (!force && memoryOverview && isFresh && !memoryOverviewDirtyRef.current) {
            return
        }

        if (memoryOverviewRequestRef.current) {
            return memoryOverviewRequestRef.current
        }

        if (!silent) {
            setMemoryOverviewLoading(true)
        }
        setMemoryOverviewError(null)

        const request = (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}${API_PATHS.AI_MEMORY_OVERVIEW}`, {
                    headers: getApiHeaders()
                })
                if (!response.ok) {
                    throw new Error(t('chat.memory.panel.loadFailed'))
                }
                const payload = await response.json()
                setMemoryOverview(payload)
                setMemoryOverviewUpdatedAt(Date.now())
                memoryOverviewLastFetchedAtRef.current = Date.now()
                memoryOverviewDirtyRef.current = false
            } catch (error) {
                console.error('Failed to load memory overview', error)
                setMemoryOverviewError(error instanceof Error ? error.message : t('chat.memory.panel.loadFailed'))
            } finally {
                if (!silent) {
                    setMemoryOverviewLoading(false)
                }
                memoryOverviewRequestRef.current = null
            }
        })()

        memoryOverviewRequestRef.current = request
        return request
    }, [evermemEnabled, getApiHeaders, memoryOverview, t])

    const activeSession = sessions.find(s => s.id === activeSessionId)
    const messages = activeSession?.messages || []
    const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    const weakWords = memoryOverview?.review_focus?.weak_words || []
    const canStartWeakWordPractice = weakWords.length > 0
    const getDisplaySessionTitle = (title: string) => {
        if (isDefaultNewChatTitle(title)) return t('chat.session.newChat')
        if (title === LEGACY_MIGRATED_CHAT_TITLE) return t('chat.session.migratedChat')
        return title
    }

    const formatSessionTimestamp = (timestamp: number) => {
        const date = new Date(timestamp)
        const now = new Date()
        const sameDay = date.toDateString() === now.toDateString()
        const yesterday = new Date(now)
        yesterday.setDate(now.getDate() - 1)
        const isYesterday = date.toDateString() === yesterday.toDateString()

        if (sameDay) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
        if (isYesterday) {
            return t('chat.sidebar.yesterday')
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }

    const getSessionPreview = (session: ChatSession) => {
        const lastMessage = [...session.messages].reverse().find(message => {
            if (message.content?.trim()) return true
            return Boolean(message.attachments && message.attachments.length > 0)
        })
        if (!lastMessage) return t('chat.sidebar.emptySession')
        if (lastMessage.content?.trim()) return lastMessage.content.trim()
        if (lastMessage.attachments && lastMessage.attachments.length > 0) {
            return t('chat.sidebar.imageMessage', { count: lastMessage.attachments.length })
        }
        return t('chat.sidebar.emptySession')
    }

    const deleteSession = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (window.confirm(t('chat.confirm.deleteSession'))) {
            try {
                await flushSessionSyncs()
                dropQueuedSessionSync(id)
                await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSION_DELETE(id)}`, {
                    method: 'DELETE',
                    headers: getCommonHeaders()
                })
            } catch (err) { console.error("Failed to delete session from DB", err) }

            setSessions(prev => {
                const filtered = prev.filter(s => s.id !== id)
                if (activeSessionId === id) {
                    setActiveSessionId(filtered.length > 0 ? filtered[0].id : null)
                }
                if (filtered.length === 0) {
                    setTimeout(() => createNewSession(), 0)
                }
                return filtered
            })
        }
    }

    const startRenameSession = (e: React.MouseEvent, session: ChatSession) => {
        e.preventDefault()
        e.stopPropagation()
        setEditingSessionId(session.id)
        setEditingTitle(isDefaultNewChatTitle(session.title) ? '' : getDisplaySessionTitle(session.title))
    }

    const commitRename = (id: string) => {
        if (editingTitle.trim()) {
            const updatedTitle = editingTitle.trim()
            setSessions(prev => {
                const updated = prev.map(s => s.id === id ? { ...s, title: updatedTitle, updatedAt: Date.now() } : s)
                const target = updated.find(s => s.id === id)
                if (target) scheduleSessionSync(target)
                return updated
            })
        }
        setEditingSessionId(null)
    }

    const cancelRename = () => {
        setEditingSessionId(null)
    }

    const clearSession = () => {
        if (!activeSessionId) return;
        if (window.confirm(t('chat.confirm.clearSession'))) {
            setSessions(prev => {
                const updated = prev.map(s => s.id === activeSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s)
                const target = updated.find(s => s.id === activeSessionId)
                if (target) scheduleSessionSync(target)
                return updated
            })
        }
    }

    const clearAllSessions = async () => {
        if (sessions.length === 0) return
        if (!window.confirm(t('chat.confirm.clearAllSessions'))) return

        try {
            await flushSessionSyncs()
            clearQueuedSessionSyncs()
            await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_SESSIONS}`, {
                method: 'DELETE',
                headers: getCommonHeaders()
            })
        } catch (error) {
            console.error('Failed to clear all chat sessions from DB', error)
        }

        setSessions([])
        setActiveSessionId(null)
        setSidebarOpen(false)
        setTimeout(() => createNewSession(), 0)
    }

    const startWeakWordPractice = () => {
        if (!canStartWeakWordPractice) return
        const words = weakWords.slice(0, 3).map(item => item.word).filter(Boolean)
        if (words.length === 0) return
        setInput(t('chat.memory.panel.practicePrompt', { words: words.join(', ') }))
        setMemoryPanelOpen(false)
        setTimeout(() => inputRef.current?.focus(), 0)
    }


    const handleSend = async () => {
        if ((!input.trim() && pendingImages.length === 0) || loading || !activeSessionId || !isInitialized) return

        const targetSessionId = activeSessionId
        const userContent = input.trim()
        let botMsgId: string | null = null
        const attachmentsToSend = pendingImages

        // Auto-rename session if it's the first message
        if (activeSession && activeSession.messages.length === 0) {
            const baseTitleSource = userContent || (attachmentsToSend.length > 0 ? t('chat.session.imageChat') : '')
            const baseTitle = baseTitleSource.length > 15 ? baseTitleSource.substring(0, 15) + '...' : baseTitleSource
            setSessions(prev => prev.map(s =>
                s.id === targetSessionId ? { ...s, title: baseTitle } : s
            ))
        }

        const userMsg: Message = {
            id: generateId(),
            role: 'user',
            content: userContent,
            attachments: attachmentsToSend,
            timestamp: Date.now()
        }

        setSessions(prev => {
            const updated = prev.map(s => {
                if (s.id === targetSessionId) {
                    return { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() }
                }
                return s
            })
            const target = updated.find(s => s.id === targetSessionId)
            if (target) scheduleSessionSync(target)
            return updated
        })

        setInput('')
        setPendingImages([])
        setLoading(true)
        isNearBottomRef.current = true

        try {
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: buildMessagePayload(m)
            }))
            history.push({ role: userMsg.role, content: buildMessagePayload(userMsg) })

            botMsgId = generateId()
            const initialBotMsg: Message = {
                id: botMsgId,
                role: 'assistant',
                content: '',
                reasoningContent: '',
                timestamp: Date.now()
            }

            // Initially add empty bot message and mark user message as saved (optimistic or wait for end)
            setSessions(prev => prev.map(s => {
                if (s.id === targetSessionId) {
                    return { ...s, messages: [...s.messages, initialBotMsg], updatedAt: Date.now() }
                }
                return s
            }))

            const response = await fetch(`${API_BASE_URL}${API_PATHS.AI_CHAT_STREAM}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getApiHeaders()
                },
                body: JSON.stringify({
                    messages: history,
                    session_id: targetSessionId
                })
            })

            if (!response.ok) {
                const raw = await response.text()
                let detailedMessage = t('chat.errors.api', { message: response.statusText })
                try {
                    const parsed = raw ? JSON.parse(raw) : null
                    const detail = parsed?.detail
                    if (typeof detail === 'string' && detail.trim()) {
                        detailedMessage = detail
                    } else if (detail?.message && typeof detail.message === 'string') {
                        detailedMessage = detail.message
                    } else if (raw && raw.trim()) {
                        detailedMessage = raw
                    }
                } catch {
                    if (raw && raw.trim()) {
                        detailedMessage = raw
                    }
                }
                throw new Error(detailedMessage)
            }
            if (!response.body) {
                throw new Error(`No response body`)
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let done = false
            let sseBuffer = ''
            let botContent = ''
            let botReasoning = ''
            let memoriesRetrieved = 0
            let memorySaved = false
            let streamFlushTimer: number | null = null
            const STREAM_FLUSH_MS = 120

            const applyBotStreamUpdate = () => {
                setSessions(prev => prev.map(s => {
                    if (s.id === targetSessionId) {
                        const updatedMessages = s.messages.map(m =>
                            m.id === botMsgId
                                ? {
                                    ...m,
                                    content: botContent,
                                    reasoningContent: botReasoning
                                }
                                : m
                        )
                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                }))
            }

            const scheduleBotStreamUpdate = () => {
                if (streamFlushTimer !== null) return
                streamFlushTimer = window.setTimeout(() => {
                    streamFlushTimer = null
                    applyBotStreamUpdate()
                    scrollToBottom(true)
                }, STREAM_FLUSH_MS)
            }

            const flushBotStreamUpdate = () => {
                if (streamFlushTimer !== null) {
                    window.clearTimeout(streamFlushTimer)
                    streamFlushTimer = null
                }
                applyBotStreamUpdate()
                scrollToBottom(true)
            }

            const handleSsePayload = (payload: string) => {
                if (!payload || payload === '[DONE]') return
                try {
                    const data = JSON.parse(payload)
                    if (data.type === 'token') {
                        const tokenChunk = typeof data.content === 'string' ? data.content : ''
                        botContent += tokenChunk
                        scheduleBotStreamUpdate()
                    } else if (data.type === 'reasoning') {
                        const reasoningChunk = typeof data.content === 'string' ? data.content : ''
                        botReasoning += reasoningChunk
                        scheduleBotStreamUpdate()
                    } else if (data.type === 'done') {
                        memoriesRetrieved = data.memories_retrieved || 0
                        memorySaved = data.memory_saved || false
                    }
                } catch {
                    // Ignore malformed payloads.
                }
            }

            const consumeSseBuffer = () => {
                while (true) {
                    const boundary = sseBuffer.indexOf('\n\n')
                    if (boundary < 0) break
                    const rawEvent = sseBuffer.slice(0, boundary)
                    sseBuffer = sseBuffer.slice(boundary + 2)

                    const payload = rawEvent
                        .split('\n')
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trimStart())
                        .join('\n')
                        .trim()

                    handleSsePayload(payload)
                }
            }

            while (!done) {
                const { value, done: readerDone } = await reader.read()
                done = readerDone
                if (value) {
                    sseBuffer += decoder.decode(value, { stream: true })
                    consumeSseBuffer()
                }
            }

            const tailPayload = sseBuffer
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n')
                .trim()
            handleSsePayload(tailPayload)
            flushBotStreamUpdate()

            // Final update with metadata
            setSessions(prev => {
                const updated = prev.map(s => {
                    if (s.id === targetSessionId) {
                        const updatedMessages = [...s.messages]
                        let lastUserIdx = -1;
                        let lastBotIdx = -1;

                        for (let i = updatedMessages.length - 1; i >= 0; i--) {
                            if (updatedMessages[i].role === 'user' && lastUserIdx === -1) lastUserIdx = i;
                            if (updatedMessages[i].id === botMsgId) lastBotIdx = i;
                        }

                        if (lastUserIdx >= 0) {
                            updatedMessages[lastUserIdx] = { ...updatedMessages[lastUserIdx], memorySaved }
                        }
                        if (lastBotIdx >= 0) {
                            updatedMessages[lastBotIdx] = {
                                ...updatedMessages[lastBotIdx],
                                content: botContent,
                                reasoningContent: botReasoning,
                                memoriesUsed: memoriesRetrieved
                            }
                        } else if (botContent || botReasoning) {
                            updatedMessages.push({
                                id: botMsgId || generateId(),
                                role: 'assistant',
                                content: botContent,
                                reasoningContent: botReasoning,
                                timestamp: Date.now(),
                                memoriesUsed: memoriesRetrieved
                            })
                        }

                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                })
                const target = updated.find(s => s.id === targetSessionId)
                if (target) scheduleSessionSync(target, { immediate: true })
                return updated
            })

            if (memoriesRetrieved > 0 || memorySaved) {
                if (memoriesRetrieved > 0 && memorySaved) {
                    setMemoryToast(t('chat.memory.toast.recalledAndSaved', { count: memoriesRetrieved }))
                } else if (memoriesRetrieved > 0) {
                    setMemoryToast(t('chat.memory.toast.recalled', { count: memoriesRetrieved }))
                } else {
                    setMemoryToast(t('chat.memory.toast.saved'))
                }
                memoryOverviewDirtyRef.current = true
                if (memoryPanelOpen) {
                    if (memoryOverviewRefreshTimerRef.current !== null) {
                        window.clearTimeout(memoryOverviewRefreshTimerRef.current)
                    }
                    memoryOverviewRefreshTimerRef.current = window.setTimeout(() => {
                        memoryOverviewRefreshTimerRef.current = null
                        void loadMemoryOverview({ force: true, silent: true })
                    }, 900)
                }
            }
        } catch (error: unknown) {
            console.error('Chat stream failed:', error)
            setSessions(prev => {
                const updated = prev.map(s => {
                    if (s.id === targetSessionId) {
                        const errorText = t('chat.errors.response', {
                            message: error instanceof Error ? error.message : t('chat.errors.failedResponse')
                        })
                        let replaced = false
                        const updatedMessages = s.messages.map(m => {
                            if (botMsgId && m.id === botMsgId) {
                                replaced = true
                                return { ...m, content: errorText, reasoningContent: '' }
                            }
                            return m
                        })
                        if (!replaced) {
                            updatedMessages.push({
                                id: generateId(),
                                role: 'assistant',
                                content: errorText,
                                reasoningContent: '',
                                timestamp: Date.now()
                            })
                        }
                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                })
                const target = updated.find(s => s.id === targetSessionId)
                if (target) scheduleSessionSync(target, { immediate: true })
                return updated
            })
        } finally {
            setLoading(false)
        }
    }

    const providerLabel = provider === 'openai' ? 'OpenAI' :
        provider === 'anthropic' ? 'Claude' :
            provider === 'dashscope' ? t('chat.providers.dashscope') :
                provider === 'gemini' ? 'Gemini' :
                    provider === 'ollama' ? 'Ollama' : provider

    useEffect(() => {
        if (!memoryPanelOpen) return
        const now = Date.now()
        const shouldForce = memoryOverviewDirtyRef.current
        const shouldRefreshInBackground =
            Boolean(memoryOverview) &&
            (now - memoryOverviewLastFetchedAtRef.current >= 60_000 || memoryOverviewDirtyRef.current)

        if (!memoryOverview) {
            void loadMemoryOverview()
            return
        }

        if (shouldForce || shouldRefreshInBackground) {
            void loadMemoryOverview({ force: shouldForce, silent: true })
        }
    }, [loadMemoryOverview, memoryOverview, memoryPanelOpen])

    useEffect(() => {
        return () => {
            if (memoryOverviewRefreshTimerRef.current !== null) {
                window.clearTimeout(memoryOverviewRefreshTimerRef.current)
            }
        }
    }, [])

    const formatMemoryTimestamp = (timestamp?: string) => {
        if (!timestamp) return ''
        try {
            return new Date(timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return ''
        }
    }

    const formatPanelUpdatedAt = (timestamp: number | null) => {
        if (!timestamp) return ''
        try {
            return new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch {
            return ''
        }
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex animate-fade-in relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg shadow-slate-300/20 dark:shadow-slate-950/30">
            {/* Global Sidebar Overlay */}
            <div
                className={`absolute inset-0 z-40 bg-slate-900/20 dark:bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                style={{ display: sidebarOpen ? 'block' : 'none' }}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar Drawer */}
            <div className={`
                absolute inset-y-0 left-0 z-50
                w-72 bg-white/96 dark:bg-slate-800/96 backdrop-blur-xl border-r border-slate-200/80 dark:border-slate-700/60 flex flex-col shadow-[4px_0_24px_rgba(15,23,42,0.06)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.4)]
                transition-transform duration-300 ease-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex-none border-b border-slate-200/80 dark:border-slate-700/60 px-4 py-4 bg-slate-50/70 dark:bg-slate-900/30">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {t('chat.sidebar.title')}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {t('chat.sidebar.count', { count: sortedSessions.length })}
                            </p>
                        </div>
                        <button
                            onClick={createNewSession}
                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm shadow-primary-500/25 transition-colors hover:bg-primary-700"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar">
                    {sortedSessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => {
                                setActiveSessionId(session.id);
                                setSidebarOpen(false);
                            }}
                            className={`
                                group rounded-2xl border p-3 cursor-pointer transition-all
                                ${activeSessionId === session.id
                                    ? 'border-primary-200 bg-primary-50/80 text-primary-700 shadow-sm shadow-primary-500/10 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200'
                                    : 'border-slate-200/90 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700/40'
                                }
                            `}
                        >
                            <div className="flex items-start gap-3 overflow-hidden flex-1 min-w-0">
                                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${activeSessionId === session.id ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/70 dark:text-slate-300'}`}>
                                    <MessageSquare size={15} className="flex-shrink-0" />
                                </div>
                                {editingSessionId === session.id ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onBlur={() => commitRename(session.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                commitRename(session.id);
                                            } else if (e.key === 'Escape') {
                                                cancelRename();
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-white dark:bg-slate-900 border border-primary-500 rounded px-2 py-0.5 text-sm text-slate-800 dark:text-white outline-none"
                                    />
                                ) : (
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-semibold">{getDisplaySessionTitle(session.title)}</span>
                                            <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                                                {formatSessionTimestamp(session.updatedAt)}
                                            </span>
                                        </div>
                                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                            {getSessionPreview(session)}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {editingSessionId !== session.id && (
                                <div className={`relative z-10 ml-2 flex items-center gap-1 self-start opacity-0 group-hover:opacity-100 transition-opacity ${activeSessionId === session.id ? 'opacity-100' : ''}`}>
                                    <button
                                        onClick={(e) => startRenameSession(e, session)}
                                        className="p-1.5 text-slate-400 hover:text-primary-500 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                        title={t('chat.actions.rename')}
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            deleteSession(e, session.id)
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                        title={t('chat.actions.delete')}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex-none border-t border-slate-200/80 dark:border-slate-700/60 px-3 py-3 bg-white/80 dark:bg-slate-800/80">
                    <button
                        onClick={clearAllSessions}
                        disabled={sortedSessions.length === 0}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-red-900/40 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                    >
                        <Trash2 size={15} />
                        {t('chat.actions.deleteAllSessions')}
                    </button>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
                {/* Header */}
                <div className="flex-none h-16 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 bg-white/92 dark:bg-slate-900/92 backdrop-blur-xl sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={sidebarOpen ? t('chat.actions.collapseHistory') : t('chat.actions.expandHistory')}
                        >
                            <Menu size={20} />
                        </button>

                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 tracking-tight">
                                <span className="hidden sm:inline">{t('chat.header.title')}</span>
                                {evermemEnabled && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 rounded-full flex items-center gap-1 border border-primary-200/70 dark:border-primary-700/50">
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500 dark:bg-primary-300" />
                                        {t('chat.header.longTermMemoryEnabled')}
                                    </span>
                                )}

                                <div className="ml-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                                    <img src={EvermemLogo} alt="EverMemOS" className="h-5 w-5 rounded" />
                                    <span className="whitespace-nowrap">Powered by EverMemOS</span>
                                </div>
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[10px] sm:text-xs">
                                {providerLabel} <span className="opacity-50">•</span> {model || t('chat.header.defaultModel')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {onOpenTranslation && (
                            <button
                                onClick={onOpenTranslation}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 dark:hover:text-primary-300"
                                title={t('sidebar.translationTooltip', 'Multilingual AI translation assistant')}
                            >
                                <Languages size={16} />
                                <span className="hidden lg:inline">{t('sidebar.translation', 'Translator')}</span>
                            </button>
                        )}
                        {evermemEnabled && (
                            <button
                                onClick={() => setMemoryPanelOpen(prev => !prev)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${memoryPanelOpen
                                    ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 dark:hover:text-primary-300'
                                    }`}
                                title={t('chat.memory.panel.title')}
                            >
                                <span className={`h-2 w-2 rounded-full ${memoryPanelOpen ? 'bg-primary-500 dark:bg-primary-300' : 'bg-slate-400 dark:bg-slate-500'}`} />
                                <span className="hidden sm:inline">{t('chat.memory.panel.button')}</span>
                            </button>
                        )}
                        <button
                            onClick={createNewSession}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-primary-500/30 hover:shadow-lg hover:shadow-primary-500/40 hover:scale-[1.02] active:scale-[0.98]"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={16} />
                            <span className="text-sm hidden sm:inline">{t('chat.actions.newChat')}</span>
                        </button>

                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const dropdown = document.getElementById('chat-actions-dropdown');
                                    if (dropdown) {
                                        if (dropdown.style.display === 'block') {
                                            dropdown.style.display = 'none';
                                        } else {
                                            dropdown.style.display = 'block';
                                            dropdown.style.top = `${rect.bottom + 8}px`;
                                            dropdown.style.right = `${window.innerWidth - rect.right}px`;
                                        }
                                    }
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title={t('chat.actions.moreOptions')}
                            >
                                <MoreHorizontal size={18} />
                            </button>

                            {/* Dropdown Menu - Click Outside to Close Handled by a global listener ideally, simplified here for pure React state or vanilla if preferred */}
                        </div>
                    </div>
                </div>

                {/* Global Dropdown (Absolute to body or container) */}
                <div
                    id="chat-actions-dropdown"
                    className="hidden fixed z-50 min-w-[160px] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm"
                    style={{ display: 'none' }}
                >
                    <div className="p-1">
                        <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors text-left"
                            onClick={() => {
                                document.getElementById('chat-actions-dropdown')!.style.display = 'none';
                                clearSession();
                            }}
                        >
                            <Eraser size={14} className="text-slate-400" />
                            <span>{t('chat.actions.clearCurrentMessages')}</span>
                        </button>

                        <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>

                        <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-left font-medium"
                            onClick={(e) => {
                                document.getElementById('chat-actions-dropdown')!.style.display = 'none';
                                if (activeSessionId) deleteSession(e, activeSessionId);
                            }}
                        >
                            <Trash2 size={14} className="text-red-500" />
                            <span>{t('chat.actions.deleteSessionRecord')}</span>
                        </button>
                    </div>
                </div>

                {/* Memory Toast */}
                {memoryToast && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 animate-fade-in shadow-xl">
                        <div className="bg-indigo-600/95 backdrop-blur-md text-white text-sm px-4 py-2 rounded-full shadow-indigo-500/20 shadow-lg flex items-center gap-2 whitespace-nowrap border border-indigo-500">
                            <span className="h-2 w-2 rounded-full bg-white/90" />
                            {memoryToast}
                        </div>
                    </div>
                )}

                <div className={`absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l border-slate-200/80 dark:border-slate-700/60 bg-white/96 dark:bg-slate-900/96 backdrop-blur-xl shadow-[-8px_0_24px_rgba(15,23,42,0.08)] dark:shadow-[-8px_0_24px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out ${memoryPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-700/60 px-4 py-4">
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {t('chat.memory.panel.title')}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {t('chat.memory.panel.subtitle')}
                                </p>
                                {memoryOverviewUpdatedAt && (
                                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                        {t('chat.memory.panel.updatedAt', { time: formatPanelUpdatedAt(memoryOverviewUpdatedAt) })}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => void loadMemoryOverview({ force: true })}
                                    className="rounded-lg px-2.5 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                    title={t('chat.memory.panel.refresh')}
                                >
                                    {t('chat.memory.panel.refresh')}
                                </button>
                                <button
                                    onClick={() => setMemoryPanelOpen(false)}
                                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    title={t('chat.memory.panel.close')}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 custom-scrollbar">
                            {memoryOverviewLoading && (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                                    {t('chat.memory.panel.loading')}
                                </div>
                            )}

                            {!memoryOverviewLoading && memoryOverviewError && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                                    {memoryOverviewError}
                                </div>
                            )}

                            {!memoryOverviewLoading && memoryOverview?.requires_auth && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                                    {t('chat.memory.panel.requiresAuth')}
                                </div>
                            )}

                            {!memoryOverviewLoading && !memoryOverview?.requires_auth && (
                                <>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {t('chat.memory.panel.reviewFocusTitle')}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    {t('chat.memory.panel.reviewFocusDesc')}
                                                </p>
                                            </div>
                                            <div className="flex gap-2 text-xs font-semibold">
                                                <span className="rounded-full bg-white px-3 py-1 text-slate-600 dark:bg-slate-900 dark:text-slate-200">
                                                    {t('chat.memory.panel.dueCount', { count: memoryOverview?.review_focus?.due_count || 0 })}
                                                </span>
                                                <span className="rounded-full bg-red-100 px-3 py-1 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                                                    {t('chat.memory.panel.difficultCount', { count: memoryOverview?.review_focus?.difficult_count || 0 })}
                                                </span>
                                            </div>
                                        </div>

                                        {weakWords.length > 0 ? (
                                            <div className="mt-4 space-y-2">
                                                {weakWords.slice(0, 4).map(item => (
                                                    <div key={item.word} className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                    {item.word}
                                                                </p>
                                                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                                    {item.meaning || t('chat.memory.panel.noMeaning')}
                                                                </p>
                                                            </div>
                                                            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.is_due ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                                {item.error_count}x
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                                                {t('chat.memory.panel.noWeakWords')}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={startWeakWordPractice}
                                            disabled={!canStartWeakWordPractice}
                                            className="mt-4 w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {t('chat.memory.panel.practiceAction')}
                                        </button>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {t('chat.memory.panel.profileTitle')}
                                        </p>
                                        <div className="mt-3 space-y-2">
                                            {(memoryOverview?.profile_facts || []).length > 0 ? (
                                                memoryOverview?.profile_facts.map((fact, index) => (
                                                    <div key={`${fact}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                                                        {fact}
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    {t('chat.memory.panel.noProfile')}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {t('chat.memory.panel.recentTitle')}
                                        </p>
                                        <div className="mt-3 space-y-2">
                                            {(memoryOverview?.recent_memories || []).length > 0 ? (
                                                memoryOverview?.recent_memories.map((item, index) => (
                                                    <div key={`${item.content}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.bucket === 'review' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                                {item.bucket === 'review' ? t('chat.memory.panel.reviewBucket') : t('chat.memory.panel.chatBucket')}
                                                            </span>
                                                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                                                {formatMemoryTimestamp(item.timestamp)}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                                                            {item.content}
                                                        </p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    {t('chat.memory.panel.noRecent')}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {(memoryOverview?.suggestions || []).length > 0 && (
                                        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-800/60 dark:bg-primary-900/20">
                                            <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                                                {t('chat.memory.panel.nextTitle')}
                                            </p>
                                            <div className="mt-3 space-y-2">
                                                {memoryOverview?.suggestions.map((item, index) => (
                                                    <div key={`${item}-${index}`} className="rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Messages Area */}
                <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar scroll-smooth bg-slate-50/60 dark:bg-slate-900/30">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center">
                            <div className="relative mb-8">
                                <div className="absolute -inset-6 bg-gradient-to-br from-primary-100/45 to-slate-200/30 dark:from-primary-900/20 dark:to-slate-800/20 rounded-full blur-2xl" />
                                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
                                    <Sparkles size={36} className="text-white drop-shadow-sm" />
                                </div>
                            </div>
                            <p className="text-lg font-bold text-slate-900 dark:text-white mb-1 tracking-tight">{t('chat.empty.title')}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('chat.empty.subtitle')}</p>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            {msg.role === 'assistant' && (
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/30 ring-2 ring-primary-200/50 dark:ring-primary-700/30">
                                    <Sparkles size={18} />
                                </div>
                            )}

                            <div className={`flex flex-col gap-1.5 max-w-[85%] md:max-w-[75%]`}>
                                <div className={`rounded-2xl px-5 py-3.5 shadow-sm text-[16.5px] leading-[1.75] whitespace-pre-wrap relative
                                    ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm shadow-md shadow-primary-500/25'
                                        : 'bg-white dark:bg-slate-800/94 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200 dark:border-slate-700/70 shadow-sm shadow-slate-300/10 dark:shadow-slate-950/20'
                                    }`}
                                >
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className={`mb-3 grid gap-2 ${msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                            {msg.attachments.map(attachment => (
                                                <div
                                                    key={attachment.id}
                                                    className={`overflow-hidden rounded-2xl border ${msg.role === 'user'
                                                        ? 'border-white/20 bg-white/10'
                                                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60'
                                                        }`}
                                                >
                                                    <img
                                                        src={attachment.dataUrl}
                                                        alt={attachment.name}
                                                        className="block max-h-64 w-full object-cover"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {msg.content || (msg.reasoningContent && msg.reasoningContent.trim()) ? (
                                        <div className="space-y-2">
                                            {msg.role === 'assistant' && msg.reasoningContent && msg.reasoningContent.trim() && (
                                                <div className="rounded-xl border border-primary-200/70 dark:border-primary-700/50 bg-primary-50/70 dark:bg-primary-900/20 overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedReasoning(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary-100/60 dark:hover:bg-primary-800/20 transition-colors"
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0 text-primary-700 dark:text-primary-300 text-sm font-semibold truncate">
                                                            <ChevronRight
                                                                size={15}
                                                                className={`shrink-0 transition-transform duration-200 ${expandedReasoning[msg.id] ? 'rotate-90' : ''}`}
                                                            />
                                                            <span className="truncate">{t('chat.reasoning.title')}</span>
                                                        </span>
                                                        <span className="shrink-0 text-[11px] text-primary-500/90 dark:text-primary-300/80">
                                                            {expandedReasoning[msg.id] ? t('chat.reasoning.collapse') : t('chat.reasoning.expand')}
                                                        </span>
                                                    </button>
                                                    <div
                                                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${expandedReasoning[msg.id] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                                    >
                                                        <div className="overflow-hidden">
                                                            {expandedReasoning[msg.id] && (
                                                                <div className="border-t border-primary-200/70 dark:border-primary-700/50 px-3 py-2 text-[13px] leading-7 whitespace-pre-wrap text-primary-700/90 dark:text-primary-200/90 max-h-[22rem] overflow-y-auto custom-scrollbar">
                                                                    {msg.reasoningContent}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {msg.content && <div>{msg.content}</div>}
                                            {msg.role === 'assistant' && msg.content && (
                                                <div className="mt-3 flex items-center justify-end border-t border-slate-200/70 dark:border-slate-700/70 pt-2">
                                                    <AudioButton
                                                        text={msg.content}
                                                        useTTS={true}
                                                        size={16}
                                                        className="!p-2.5 bg-slate-50 hover:bg-primary-50 dark:bg-slate-900/70 dark:hover:bg-primary-900/30 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-300"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        msg.role === 'assistant' && loading && (
                                            <div className="flex gap-1.5 items-center h-6">
                                                {evermemEnabled ? (
                                                    <span className="text-[13px] font-medium text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5">
                                                        <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
                                                        {t('chat.loading.thinking')}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </>
                                                )}
                                            </div>
                                        )
                                    )}

                                </div>

                                {/* Memory indicators */}
                                {msg.role === 'user' && msg.memorySaved && (
                                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 self-end mr-1 font-medium">
                                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" /> {t('chat.memory.savedIndicator')}
                                    </span>
                                )}
                                {msg.role === 'assistant' && (msg.memoriesUsed || 0) > 0 && (
                                    <span className="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 ml-1 font-medium">
                                        <Sparkles size={10} /> {t('chat.memory.retrievedIndicator', { count: msg.memoriesUsed })}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Input Area */}
                <div className="flex-none p-4 bg-white/92 dark:bg-slate-900/88 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700/70">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageSelect}
                    />
                    <div
                        className={`max-w-4xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm shadow-slate-300/15 dark:shadow-slate-950/20 border p-2 relative focus-within:ring-2 focus-within:ring-primary-400/25 focus-within:border-primary-300/70 transition-all cursor-text ${isDragOverComposer ? 'border-primary-300 bg-primary-50/40 dark:border-primary-700 dark:bg-primary-900/10' : 'border-slate-200 dark:border-slate-700'}`}
                        onClick={() => inputRef.current?.focus()}
                        onDragOver={(event) => {
                            event.preventDefault()
                            setIsDragOverComposer(true)
                        }}
                        onDragEnter={(event) => {
                            event.preventDefault()
                            setIsDragOverComposer(true)
                        }}
                        onDragLeave={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget as Node)) return
                            setIsDragOverComposer(false)
                        }}
                        onDrop={handleComposerDrop}
                    >
                        {pendingImages.length > 0 && (
                            <div className="px-2 pt-2 pb-1">
                                <div className="flex flex-wrap gap-2">
                                    {pendingImages.map(attachment => (
                                        <div
                                            key={attachment.id}
                                            className="group relative w-20 h-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        >
                                            <img
                                                src={attachment.dataUrl}
                                                alt={attachment.name}
                                                className="h-full w-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    removePendingImage(attachment.id)
                                                }}
                                                className="absolute top-1 right-1 rounded-full bg-slate-900/65 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                                title={t('chat.attachments.removeImage')}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex gap-3 items-end">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    fileInputRef.current?.click()
                                }}
                                className="mb-0.5 ml-0.5 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 dark:hover:text-primary-300"
                                title={t('chat.attachments.attachImage')}
                            >
                                <Paperclip size={18} />
                            </button>
                        <textarea
                            ref={inputRef}
                            autoFocus
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onPaste={handleComposerPaste}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder={t('chat.input.placeholder')}
                            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-3 max-h-48 min-h-[52px] resize-none text-[15px] text-slate-800 dark:text-white placeholder-slate-400 custom-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && pendingImages.length === 0) || loading || !activeSessionId || !isInitialized}
                            className="p-3.5 mb-0.5 mr-0.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 active:from-primary-700 active:to-primary-800 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all flex-shrink-0 shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40 hover:scale-105 active:scale-95"
                        >
                            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} className="translate-x-[1px] -translate-y-[1px]" />}
                        </button>
                        </div>
                    </div>
                    <div className="text-center mt-2.5">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {t('chat.attachments.hint')} <span className="opacity-60">•</span>{' '}
                            {t('chat.disclaimer')}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
