import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Trash2, Sparkles, Plus, MessageSquare, Menu, Edit2, MoreHorizontal, Eraser, ChevronRight, Paperclip, X, Languages, RotateCw, Search, BookOpen, MessageCircle, FileText } from 'lucide-react'
import { api, API_PATHS, API_BASE_URL, getClientId } from '../utils/api'
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
    attachments?: Attachment[]
    timestamp: number
    memoriesUsed?: number
    memorySaved?: boolean
    reasoningContent?: string
}

interface Attachment {
    id: string
    name: string
    dataUrl?: string
    mediaType: string
    size: number
    objectKey?: string
    fileType?: 'image' | 'document'
    ext?: string
    file?: File
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
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') return true
        const saved = localStorage.getItem('chat_sidebar_open')
        if (saved !== null) return saved === 'true'
        return window.innerWidth >= 1024
    })
    const [searchQuery, setSearchQuery] = useState('')
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
    const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
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

    const MAX_ATTACHMENTS = 3
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024
    const MAX_PDF_BYTES = 20 * 1024 * 1024

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
        let activeModel = modelsMap[currentProvider] || localStorage.getItem('ai_model') || ''

        // Auto-migrate legacy models to qwen-flash-latest immediately on load
        if (currentProvider === 'dashscope' && (activeModel === 'qwen-plus' || activeModel === 'qwen3.5-flash' || !activeModel) && !localStorage.getItem('qwen_flash_latest_migrated')) {
            activeModel = 'qwen-flash-latest'
            modelsMap[currentProvider] = activeModel
            localStorage.setItem('qwen_flash_latest_migrated', 'true')
            localStorage.setItem('ai_models_map', JSON.stringify(modelsMap))
            localStorage.setItem('ai_model', activeModel)
        }

        setModel(activeModel)
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
                // If the most recent session is already used, auto-create a clean new session
                const mostRecent = loadedSessions[0]
                if (mostRecent && mostRecent.messages.length > 0) {
                    const newSession: ChatSession = {
                        id: buildScopedSessionId(chatScope),
                        title: DEFAULT_NEW_CHAT_TITLE,
                        messages: [],
                        updatedAt: Date.now(),
                        createdAt: Date.now()
                    }
                    loadedSessions.unshift(newSession)
                    setSessions(loadedSessions)
                    setActiveSessionId(newSession.id)
                    scheduleSessionSync(newSession)
                } else {
                    setSessions(loadedSessions)
                    setActiveSessionId(mostRecent.id)
                }

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

    // Entering AI chat ensures at least one session exists, but doesn't force a new one if they have history.
    useEffect(() => {
        if (!isActive) {
            wasActiveRef.current = false
            return
        }
        if (!isInitialized || wasActiveRef.current) return
        wasActiveRef.current = true

        if (sessions.length === 0) {
            createNewSession()
        }
    }, [createNewSession, isActive, isInitialized, sessions.length])

    useEffect(() => {
        if (!isInitialized) return
        const scopedStorageKey = getScopedStorageKey(chatScope)
        if (sessions.length > 0) {
            localStorage.setItem(scopedStorageKey, JSON.stringify(sessions))
        } else {
            localStorage.removeItem(scopedStorageKey)
        }
    }, [sessions, isInitialized, chatScope])

    useEffect(() => {
        localStorage.setItem('chat_sidebar_open', String(sidebarOpen))
    }, [sidebarOpen])

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
            if (attachment.fileType === 'document') {
                parts.push({ type: 'text', text: `[Attached PDF: ${attachment.name}]` })
            } else {
                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: attachment.dataUrl
                    }
                })
            }
        }
        return parts.length > 0 ? parts : message.content
    }

    const readImageAsDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : ''
                if (!result) {
                    reject(new Error('Failed to read image'))
                    return
                }
                resolve(result)
            }
            reader.onerror = () => reject(new Error('Failed to read image'))
            reader.readAsDataURL(file)
        })
    }

    const addAttachmentFiles = async (files: File[]) => {
        if (files.length === 0) return

        const accepted: Attachment[] = []
        for (const file of files) {
            if (accepted.length + pendingAttachments.length >= MAX_ATTACHMENTS) {
                window.alert(t('chat.attachments.maxAttachments', { count: MAX_ATTACHMENTS }))
                break
            }
            const isImage = file.type.startsWith('image/')
            const isPdf = file.type === 'application/pdf'
            if (!isImage && !isPdf) {
                window.alert(t('chat.attachments.unsupportedType'))
                continue
            }
            const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
            if (file.size > limit) {
                const key = isPdf ? 'chat.attachments.pdfTooLarge' : 'chat.attachments.imageTooLarge'
                window.alert(t(key, { name: file.name }))
                continue
            }
            const att: Attachment = {
                id: generateId(),
                name: file.name,
                mediaType: file.type,
                size: file.size,
                fileType: isPdf ? 'document' : 'image',
                ext: (file.name.split('.').pop() || '').toLowerCase(),
                file,
            }
            if (isImage) {
                try {
                    att.dataUrl = await readImageAsDataUrl(file)
                } catch {
                    window.alert(t('chat.attachments.loadFailed'))
                    continue
                }
            }
            accepted.push(att)
        }
        if (accepted.length > 0) {
            setPendingAttachments(prev => [...prev, ...accepted])
        }
    }

    const presignAttachment = async (att: Attachment): Promise<Attachment> => {
        if (!att.file) throw new Error('no file reference')
        const fd = new FormData()
        fd.append('file', att.file, att.name)
        const data = await api.upload<{ objectKey: string; fileType: string; fileName: string }>(
            API_PATHS.ATTACHMENTS_PRESIGN,
            fd,
        )
        return { ...att, objectKey: data.objectKey, fileType: data.fileType as 'image' | 'document' }
    }

    const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputElement = event.currentTarget
        const files = Array.from(event.target.files || [])
        try {
            await addAttachmentFiles(files)
        } finally {
            inputElement.value = ''
        }
    }

    const handleComposerPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboardFiles = Array.from(event.clipboardData?.files || [])
        const acceptedFiles = clipboardFiles.filter(file => file.type.startsWith('image/') || file.type === 'application/pdf')
        if (acceptedFiles.length === 0) return

        event.preventDefault()
        await addAttachmentFiles(acceptedFiles)
    }

    const handleComposerDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setIsDragOverComposer(false)
        const droppedFiles = Array.from(event.dataTransfer?.files || [])
        await addAttachmentFiles(droppedFiles)
    }

    const removePendingAttachment = (attachmentId: string) => {
        setPendingAttachments(prev => prev.filter(item => item.id !== attachmentId))
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

    const activeSession = sessions.find(s => s.id === activeSessionId)
    const messages = activeSession?.messages || []

    const filteredSessions = useMemo(() => {
        if (!searchQuery.trim()) return sessions
        const q = searchQuery.toLowerCase()
        return sessions.filter(s =>
            getDisplaySessionTitle(s.title).toLowerCase().includes(q) ||
            s.messages.some(m => m.content.toLowerCase().includes(q))
        )
    }, [sessions, searchQuery, t])

    const groupedSessions = useMemo(() => {
        const sorted = [...filteredSessions].sort((a, b) => b.updatedAt - a.updatedAt)
        const groups: Record<string, ChatSession[]> = {
            today: [],
            yesterday: [],
            previous7Days: [],
            previous30Days: [],
            older: []
        }

        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const todayTimestamp = now.getTime()
        const yesterdayTimestamp = todayTimestamp - 24 * 60 * 60 * 1000
        const sevenDaysTimestamp = todayTimestamp - 7 * 24 * 60 * 60 * 1000
        const thirtyDaysTimestamp = todayTimestamp - 30 * 24 * 60 * 60 * 1000

        sorted.forEach(session => {
            const time = session.updatedAt
            if (time >= todayTimestamp) groups.today.push(session)
            else if (time >= yesterdayTimestamp) groups.yesterday.push(session)
            else if (time >= sevenDaysTimestamp) groups.previous7Days.push(session)
            else if (time >= thirtyDaysTimestamp) groups.previous30Days.push(session)
            else groups.older.push(session)
        })

        return groups
    }, [filteredSessions])

    const weakWords = memoryOverview?.review_focus?.weak_words || []
    const canStartWeakWordPractice = weakWords.length > 0

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
        if ((!input.trim() && pendingAttachments.length === 0) || loading || !activeSessionId || !isInitialized) return

        const targetSessionId = activeSessionId
        const userContent = input.trim()
        let botMsgId: string | null = null

        // Presign all pending attachments to Evermind S3
        let uploadedAttachments: Attachment[] = []
        if (pendingAttachments.length > 0) {
            try {
                uploadedAttachments = await Promise.all(
                    pendingAttachments.map(att => presignAttachment(att))
                )
            } catch (err) {
                console.error('Presign upload failed', err)
                window.alert(t('chat.attachments.uploadFailed', { name: pendingAttachments[0]?.name || '' }))
                return
            }
        }

        // Strip transient File objects before storing in session history
        const attachmentsForStore: Attachment[] = uploadedAttachments.map(att => ({
            id: att.id,
            name: att.name,
            dataUrl: att.dataUrl,
            mediaType: att.mediaType,
            size: att.size,
            objectKey: att.objectKey,
            fileType: att.fileType,
            ext: att.ext,
        }))

        // Auto-rename session if it's the first message
        if (activeSession && activeSession.messages.length === 0) {
            const baseTitleSource = userContent || (attachmentsForStore.length > 0 ? t('chat.session.imageChat') : '')
            const baseTitle = baseTitleSource.length > 15 ? baseTitleSource.substring(0, 15) + '...' : baseTitleSource
            setSessions(prev => prev.map(s =>
                s.id === targetSessionId ? { ...s, title: baseTitle } : s
            ))
        }

        const userMsg: Message = {
            id: generateId(),
            role: 'user',
            content: userContent,
            attachments: attachmentsForStore,
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
        setPendingAttachments([])
        setLoading(true)
        isNearBottomRef.current = true

        try {
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: buildMessagePayload(m)
            }))
            history.push({ role: userMsg.role, content: buildMessagePayload(userMsg) })

            // Build mRAG attachment metadata for backend dual-write
            const mragAttachments = uploadedAttachments
                .filter(a => a.objectKey)
                .map(a => ({ type: a.fileType, uri: a.objectKey, name: a.name, ext: a.ext }))

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
                    session_id: targetSessionId,
                    ...(mragAttachments.length > 0 ? { attachments: mragAttachments } : {}),
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
        <div className="h-[calc(100vh-4rem)] flex animate-fade-in relative rounded-3xl overflow-hidden border border-stone-200/60 dark:border-stone-700/60 bg-stone-50/50 dark:bg-stone-900/50 shadow-2xl shadow-stone-200/40 dark:shadow-black/40">
            {/* Immersive Animated Background */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-rose-400/10 dark:bg-rose-900/10 blur-[120px] animate-pulse-slow" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-amber-400/10 dark:bg-amber-900/10 blur-[120px] animate-pulse-slow" style={{ animationDelay: '3s' }} />
                <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full bg-amber-400/10 dark:bg-amber-900/5 blur-[100px] animate-pulse-slow" style={{ animationDelay: '5s' }} />
            </div>

            {/* Global Sidebar Overlay (Mobile only) */}
            {/* Global Sidebar Overlay (Click outside/blank space to close) */}
            {sidebarOpen && (
                <div
                    className="absolute inset-0 z-40 bg-stone-900/15 dark:bg-stone-900/40 backdrop-blur-[1px] lg:bg-transparent lg:backdrop-blur-none transition-opacity duration-300 opacity-100 pointer-events-auto cursor-pointer"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar Drawer */}
            <div className={`
                absolute lg:relative inset-y-0 left-0 z-50
                bg-white/40 dark:bg-stone-900/40 backdrop-blur-3xl flex flex-col shadow-2xl lg:shadow-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden
                ${sidebarOpen 
                    ? 'translate-x-0 w-72 lg:w-72 opacity-100 lg:opacity-100 border-r border-white/20 dark:border-stone-800/20 lg:border-r lg:border-white/20 lg:dark:border-stone-800/20' 
                    : '-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 lg:border-none'
                }
            `}>
                <div className="flex-none px-6 pt-8 pb-4">
                    <div className="flex items-center justify-between gap-3 mb-6">
                        <p className="text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-[0.2em]">
                            {t('chat.sidebar.title')}
                        </p>
                        <button
                            onClick={createNewSession}
                            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-lg shadow-stone-900/10 dark:shadow-black/20 hover:scale-110 active:scale-95 transition-all"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-amber-500 transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('chat.sidebar.searchPlaceholder', 'Search history...')}
                            className="w-full bg-white/40 dark:bg-stone-800/40 border border-white/60 dark:border-stone-700/60 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-stone-700 dark:text-stone-200 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar">
                    {(Object.entries(groupedSessions) as [string, ChatSession[]][]).map(([key, groupSessions]) => {
                        if (groupSessions.length === 0) return null;
                        return (
                            <div key={key} className="space-y-2">
                                <h3 className="px-3 text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="h-px flex-1 bg-stone-200/50 dark:bg-stone-700/50" />
                                    {t(`chat.sidebar.groups.${key}`)}
                                    <span className="h-px flex-1 bg-stone-200/50 dark:bg-stone-700/50" />
                                </h3>
                                <div className="space-y-1">
                                    {groupSessions.map(session => (
                                        <div
                                            key={session.id}
                                            onClick={() => {
                                                setActiveSessionId(session.id);
                                                if (window.innerWidth < 1024) setSidebarOpen(false);
                                            }}
                                            className={`
                                                group relative rounded-2xl border p-3 cursor-pointer transition-all duration-300
                                                ${activeSessionId === session.id
                                                    ? 'border-amber-500/30 bg-amber-500/10 dark:bg-amber-400/10 shadow-sm'
                                                    : 'border-transparent hover:bg-white/40 dark:hover:bg-stone-800/40'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${activeSessionId === session.id ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-110' : 'bg-white/50 dark:bg-stone-800/50 text-stone-400 border border-stone-200/50 dark:border-stone-700/50'}`}>
                                                    <MessageSquare size={14} />
                                                </div>
                                                {editingSessionId === session.id ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editingTitle}
                                                        onChange={(e) => setEditingTitle(e.target.value)}
                                                        onBlur={() => commitRename(session.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') commitRename(session.id);
                                                            else if (e.key === 'Escape') cancelRename();
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full bg-white dark:bg-stone-900 border border-amber-500 rounded-xl px-2 py-1 text-xs text-stone-800 dark:text-white outline-none font-bold"
                                                    />
                                                ) : (
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={`block truncate text-xs font-bold ${activeSessionId === session.id ? 'text-amber-600 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'}`}>
                                                                {getDisplaySessionTitle(session.title)}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-stone-400/80 dark:text-stone-500 shrink-0">
                                                                {formatSessionTimestamp(session.updatedAt)}
                                                            </span>
                                                        </div>
                                                        <p className="mt-0.5 truncate text-[10px] font-medium text-stone-400 dark:text-stone-500">
                                                            {getSessionPreview(session)}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {editingSessionId !== session.id && (
                                                <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => startRenameSession(e, session)}
                                                        className="p-1.5 text-stone-400 hover:text-amber-500 rounded-lg hover:bg-white dark:hover:bg-stone-700 transition-all"
                                                        title={t('chat.actions.rename')}
                                                    >
                                                        <Edit2 size={11} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            deleteSession(e, session.id)
                                                        }}
                                                        className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg hover:bg-white dark:hover:bg-stone-700 transition-all"
                                                        title={t('chat.actions.delete')}
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="flex-none p-4">
                    <button
                        onClick={clearAllSessions}
                        disabled={sessions.length === 0}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200/50 bg-red-500/5 px-4 py-3 text-[10px] font-black text-red-500 transition-all hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-20 uppercase tracking-[0.2em]"
                    >
                        <Trash2 size={14} />
                        {t('chat.actions.deleteAllSessions')}
                    </button>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-stone-50/30 dark:bg-stone-900/20 relative">
                {/* Header */}
                <div className="flex-none h-16 border-b border-stone-200/30 dark:border-stone-700/30 flex items-center justify-between px-6 bg-white/40 dark:bg-stone-900/40 backdrop-blur-2xl sticky top-0 z-10">
                    <div className="flex items-center gap-3 min-w-0 flex-shrink-1">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 -ml-2 text-stone-500 hover:text-primary-600 dark:text-stone-400 dark:hover:text-primary-400 rounded-xl hover:bg-white/50 dark:hover:bg-stone-800/50 transition-all border border-transparent hover:border-stone-200/50 dark:hover:border-stone-700/50"
                            title={sidebarOpen ? t('chat.actions.collapseHistory') : t('chat.actions.expandHistory')}
                        >
                            <Menu size={18} />
                        </button>

                        <div className="flex items-center gap-2.5 min-w-0">
                            <h2 className="text-sm font-black text-stone-900 dark:text-white tracking-tight flex items-center gap-1.5 flex-shrink-0">
                                <span>{t('chat.header.title')}</span>
                            </h2>
                            <span className="text-stone-200 dark:text-stone-800 text-xs">|</span>
                            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-stone-100/80 dark:bg-stone-800/80 text-[9px] font-bold text-stone-500 dark:text-stone-400 border border-stone-200/20 dark:border-stone-700/20">
                                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="truncate max-w-[120px]">{model || t('chat.header.defaultModel')}</span>
                                </span>
                                {evermemEnabled && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-black text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-800/20 tracking-wider uppercase">
                                        <img src={EvermemLogo} className="w-3 h-3 object-contain" alt="Evermem" />
                                        EVERMIND ACTIVE
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {onOpenTranslation && (
                            <button
                                onClick={onOpenTranslation}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-stone-200/50 bg-white/30 text-[11px] font-bold text-stone-600 transition-all hover:bg-white/60 hover:border-primary-200 dark:border-stone-700/50 dark:bg-stone-800/30 dark:text-stone-300 dark:hover:bg-stone-800/60 shadow-sm"
                                title={t('sidebar.translationTooltip')}
                            >
                                <Languages size={13} />
                                <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'lg:inline'}`}>{t('sidebar.translation')}</span>
                            </button>
                        )}
                        {evermemEnabled && (
                            <button
                                onClick={() => setMemoryPanelOpen(prev => !prev)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm ${memoryPanelOpen
                                    ? 'border-amber-300/50 bg-amber-50/50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'border-stone-200/50 bg-white/30 text-stone-600 hover:bg-white/60 hover:border-amber-300 dark:border-stone-700/50 dark:bg-stone-800/30 dark:text-stone-300 dark:hover:bg-stone-800/60'
                                    }`}
                                title={t('chat.memory.panel.title')}
                            >
                                <Sparkles size={13} className={memoryPanelOpen ? 'text-amber-500' : 'text-stone-400'} />
                                <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'sm:inline'}`}>{t('chat.memory.panel.button')}</span>
                            </button>
                        )}
                        <button
                            onClick={createNewSession}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:scale-[1.02] active:scale-[0.98] text-[11px] font-bold rounded-xl transition-all shadow-sm"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={14} />
                            <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'sm:inline'}`}>{t('chat.actions.newChat')}</span>
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
                                            dropdown.style.top = `${rect.bottom + 12}px`;
                                            dropdown.style.right = `${window.innerWidth - rect.right}px`;
                                        }
                                    }
                                }}
                                className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-xl hover:bg-white/50 dark:hover:bg-stone-800/50 transition-all border border-transparent hover:border-stone-200/50 dark:hover:border-stone-700/50"
                                title={t('chat.actions.moreOptions')}
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Global Dropdown (Absolute to body or container) */}
                <div
                    id="chat-actions-dropdown"
                    className="hidden fixed z-50 min-w-[200px] bg-white/80 dark:bg-stone-900/80 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/60 dark:border-stone-800/60 overflow-hidden p-1.5 animate-scale-up"
                    style={{ display: 'none' }}
                >
                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-stone-700 dark:text-stone-300 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 rounded-xl transition-all text-left font-bold text-xs uppercase tracking-wider"
                        onClick={() => {
                            document.getElementById('chat-actions-dropdown')!.style.display = 'none';
                            clearSession();
                        }}
                    >
                        <Eraser size={16} className="opacity-60" />
                        <span>{t('chat.actions.clearCurrentMessages')}</span>
                    </button>

                    <button
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-all text-left font-bold text-xs uppercase tracking-wider mt-1"
                        onClick={(e) => {
                            document.getElementById('chat-actions-dropdown')!.style.display = 'none';
                            if (activeSessionId) deleteSession(e, activeSessionId);
                        }}
                    >
                        <Trash2 size={16} className="opacity-60" />
                        <span>{t('chat.actions.deleteSessionRecord')}</span>
                    </button>
                </div>

                {/* Memory Toast */}
                {memoryToast && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
                        <div className="bg-white/80 dark:bg-stone-900/80 backdrop-blur-3xl text-amber-600 dark:text-amber-400 text-[11px] font-bold px-6 py-3 rounded-2xl shadow-2xl shadow-amber-500/10 flex items-center gap-3 whitespace-nowrap border border-white/60 dark:border-stone-800/60 uppercase tracking-widest">
                            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            {memoryToast}
                        </div>
                    </div>
                )}

                <div className={`absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l border-white/20 dark:border-stone-800/20 bg-white/60 dark:bg-stone-900/60 backdrop-blur-3xl shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${memoryPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-3 border-b border-stone-200/20 dark:border-stone-700/20 px-6 py-6">
                            <div>
                                <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                                    {t('chat.memory.panel.title')}
                                </p>
                                <p className="mt-1 text-lg font-bold text-stone-900 dark:text-stone-100">
                                    {t('chat.memory.panel.subtitle')}
                                </p>
                                {memoryOverviewUpdatedAt && (
                                    <p className="mt-1 text-[10px] font-bold text-amber-500/60 uppercase tracking-wider">
                                        {t('chat.memory.panel.updatedAt', { time: formatPanelUpdatedAt(memoryOverviewUpdatedAt) })}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => void loadMemoryOverview({ force: true })}
                                    className="rounded-xl p-2.5 text-stone-400 transition-all hover:bg-white/50 dark:hover:bg-stone-800/50 hover:text-amber-500"
                                    title={t('chat.memory.panel.refresh')}
                                >
                                    <RotateCw size={16} className={memoryOverviewLoading ? 'animate-spin' : ''} />
                                </button>
                                <button
                                    onClick={() => setMemoryPanelOpen(false)}
                                    className="rounded-xl p-2.5 text-stone-400 transition-all hover:bg-white/50 dark:hover:bg-stone-800/50 hover:text-stone-600"
                                    title={t('chat.memory.panel.close')}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 custom-scrollbar">
                            {memoryOverviewLoading && !memoryOverview && (
                                <div className="flex flex-col items-center justify-center h-40 space-y-3">
                                    <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">{t('chat.memory.panel.loading')}</p>
                                </div>
                            )}

                            {!memoryOverviewLoading && memoryOverviewError && (
                                <div className="rounded-2xl border border-red-200/50 bg-red-500/5 px-4 py-4 text-xs font-bold text-red-500 uppercase tracking-wider">
                                    {memoryOverviewError}
                                </div>
                            )}

                            {!memoryOverviewLoading && memoryOverview?.requires_auth && (
                                <div className="rounded-2xl border border-amber-200/50 bg-amber-500/5 px-4 py-4 text-xs font-bold text-amber-600 uppercase tracking-wider">
                                    {t('chat.memory.panel.requiresAuth')}
                                </div>
                            )}

                            {!memoryOverviewLoading && !memoryOverview?.requires_auth && (
                                <>
                                    <div className="rounded-2xl border border-stone-200/30 bg-white/40 dark:bg-stone-800/40 p-5 shadow-sm">
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                                                {t('chat.memory.panel.reviewFocusTitle')}
                                            </p>
                                            <div className="flex gap-2">
                                                <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-200/30">
                                                    {memoryOverview?.review_focus?.due_count || 0}
                                                </span>
                                            </div>
                                        </div>

                                        {weakWords.length > 0 ? (
                                            <div className="space-y-2">
                                                {weakWords.slice(0, 4).map(item => (
                                                    <div key={item.word} className="rounded-xl border border-white/60 dark:border-stone-700/60 bg-white/40 dark:bg-stone-900/40 px-3 py-2.5 transition-all hover:bg-white/80 dark:hover:bg-stone-900/60">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">
                                                                    {item.word}
                                                                </p>
                                                                <p className="truncate text-[11px] text-stone-500 dark:text-stone-400 font-medium mt-0.5">
                                                                    {item.meaning || t('chat.memory.panel.noMeaning')}
                                                                </p>
                                                            </div>
                                                            <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${item.is_due ? 'bg-amber-500/10 text-amber-600 border border-amber-200/30' : 'bg-stone-500/10 text-stone-500 border border-stone-200/30'}`}>
                                                                {item.error_count}x
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs font-medium text-stone-400 italic">
                                                {t('chat.memory.panel.noWeakWords')}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={startWeakWordPractice}
                                            disabled={!canStartWeakWordPractice}
                                            className="mt-5 w-full rounded-2xl bg-amber-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-600 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:hover:scale-100 uppercase tracking-widest"
                                        >
                                            {t('chat.memory.panel.practiceAction')}
                                        </button>
                                    </div>

                                    <div className="rounded-2xl border border-stone-200/30 bg-white/40 dark:bg-stone-800/40 p-5 shadow-sm">
                                        <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-4">
                                            {t('chat.memory.panel.profileTitle')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {(memoryOverview?.profile_facts || []).length > 0 ? (
                                                memoryOverview?.profile_facts.map((fact, index) => (
                                                    <div key={`${fact}-${index}`} className="rounded-xl border border-white/60 dark:border-stone-700/60 bg-white/40 dark:bg-stone-900/40 px-3 py-2 text-[11px] font-bold text-stone-600 dark:text-stone-300">
                                                        {fact}
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs font-medium text-stone-400 italic">
                                                    {t('chat.memory.panel.noProfile')}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-stone-200/30 bg-white/40 dark:bg-stone-800/40 p-5 shadow-sm">
                                        <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-4">
                                            {t('chat.memory.panel.recentTitle')}
                                        </p>
                                        <div className="space-y-3">
                                            {(memoryOverview?.recent_memories || []).length > 0 ? (
                                                memoryOverview?.recent_memories.map((item, index) => (
                                                    <div key={`${item.content}-${index}`} className="relative pl-4 border-l-2 border-amber-500/20">
                                                        <div className="flex items-center justify-between gap-3 mb-1">
                                                            <span className={`text-[10px] font-bold uppercase tracking-widest ${item.bucket === 'review' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                {item.bucket === 'review' ? t('chat.memory.panel.reviewBucket') : t('chat.memory.panel.chatBucket')}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-stone-400">
                                                                {formatMemoryTimestamp(item.timestamp)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs font-medium text-stone-700 dark:text-stone-200 leading-relaxed">
                                                            {item.content}
                                                        </p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs font-medium text-stone-400 italic">
                                                    {t('chat.memory.panel.noRecent')}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {(memoryOverview?.suggestions || []).length > 0 && (
                                        <div className="rounded-2xl border border-amber-200/30 bg-amber-500/5 p-5">
                                            <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-4">
                                                {t('chat.memory.panel.nextTitle')}
                                            </p>
                                            <div className="space-y-2">
                                                {memoryOverview?.suggestions.map((item, index) => (
                                                    <button
                                                        key={`${item}-${index}`}
                                                        onClick={() => {
                                                            setInput(item);
                                                            setMemoryPanelOpen(false);
                                                            inputRef.current?.focus();
                                                        }}
                                                        className="w-full text-left rounded-xl bg-white/60 dark:bg-stone-900/40 px-3 py-2.5 text-xs font-bold text-stone-600 dark:text-stone-300 border border-white/60 dark:border-stone-700/60 hover:bg-white dark:hover:bg-stone-900/80 transition-all"
                                                    >
                                                        {item}
                                                    </button>
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
                <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8 custom-scrollbar scroll-smooth relative z-10">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center animate-fade-in select-none px-4">
                            <div className="max-w-lg w-full flex flex-col items-center">
                                <h1 className="text-2xl font-black text-stone-900 dark:text-white tracking-tight text-center">
                                    {t('chat.empty.title')}
                                </h1>
                                <p className="mt-2 text-sm text-stone-400 dark:text-stone-500 font-medium text-center">
                                    {t('chat.empty.subtitle')}
                                </p>

                                <div className="mt-8 grid grid-cols-2 gap-3 w-full">
                                    {[
                                        { icon: MessageSquare, titleKey: 'chat.empty.starters.dailyTitle', descKey: 'chat.empty.starters.dailyDesc', prompt: 'Let\'s have a casual conversation in English. Ask me about my day.' },
                                        { icon: Languages, titleKey: 'chat.empty.starters.scenarioTitle', descKey: 'chat.empty.starters.scenarioDesc', prompt: 'Let\'s do a role play. You be a barista and I\'ll order coffee.' },
                                        { icon: BookOpen, titleKey: 'chat.empty.starters.grammarTitle', descKey: 'chat.empty.starters.grammarDesc', prompt: 'Check my grammar: "I went to supermarket yesterday and buyed some food."' },
                                        { icon: Sparkles, titleKey: 'chat.empty.starters.vocabTitle', descKey: 'chat.empty.starters.vocabDesc', prompt: 'Teach me 3 ways to use the word "elaborate" in different contexts.' },
                                    ].map((starter) => (
                                        <button
                                            key={starter.titleKey}
                                            onClick={() => {
                                                setInput(starter.prompt)
                                                setTimeout(() => inputRef.current?.focus(), 0)
                                            }}
                                            className="group text-left rounded-2xl border border-stone-200/60 dark:border-stone-700/40 bg-white/50 dark:bg-stone-800/30 backdrop-blur-xl p-4 transition-all duration-300 hover:border-amber-400/40 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 hover:shadow-lg hover:shadow-amber-500/5 active:scale-[0.98]"
                                        >
                                            <starter.icon size={18} className="text-stone-400 dark:text-stone-500 group-hover:text-amber-500 transition-colors" />
                                            <p className="mt-2.5 text-xs font-bold text-stone-700 dark:text-stone-200">
                                                {t(starter.titleKey)}
                                            </p>
                                            <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500 leading-relaxed">
                                                {t(starter.descKey)}
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                {evermemEnabled && memoryOverview?.review_focus && (
                                    <div className="mt-6 flex items-center gap-2 text-[11px]">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                                            {memoryOverview.review_focus.due_count} {t('chat.memory.dueToday', 'due words today')}
                                        </span>
                                        {memoryOverview.review_focus.difficult_count > 0 && (
                                            <>
                                                <span className="text-stone-300 dark:text-stone-600">·</span>
                                                <span className="text-stone-500 dark:text-stone-400 font-medium">
                                                    {memoryOverview.review_focus.difficult_count} {t('chat.memory.difficultWords', 'difficult words')}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            {msg.role === 'assistant' && (
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/60 dark:bg-stone-800/60 backdrop-blur-md text-amber-600 dark:text-amber-400 shadow-lg shadow-stone-200/10 dark:shadow-black/20 border border-white/50 dark:border-stone-700/50 self-start mt-1">
                                    <img src={EvermemLogo} className="w-5 h-5 object-contain" alt="Evermem" />
                                </div>
                            )}

                            <div className={`flex flex-col gap-2 max-w-[85%] md:max-w-[80%]`}>
                                <div className={`px-5 py-3.5 text-[15px] leading-[1.6] whitespace-pre-wrap relative transition-all
                                    ${msg.role === 'user'
                                        ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-[22px] rounded-tr-[4px] shadow-xl shadow-stone-900/10 dark:shadow-black/20 border border-stone-800 dark:border-white'
                                        : 'bg-white/60 dark:bg-stone-800/60 backdrop-blur-2xl text-stone-800 dark:text-stone-200 rounded-[22px] rounded-tl-[4px] border border-white/60 dark:border-stone-700/60 shadow-sm'
                                    }`}
                                >
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className={`mb-3 grid gap-2 ${msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                            {msg.attachments.map(attachment => (
                                                <div
                                                    key={attachment.id}
                                                    className={`overflow-hidden rounded-xl border ${msg.role === 'user'
                                                        ? 'border-white/20 bg-white/10'
                                                        : 'border-stone-200/50 bg-white dark:border-stone-700/50 dark:bg-stone-900/60'
                                                        }`}
                                                >
                                                    {attachment.fileType === 'document' ? (
                                                        <div className="flex items-center gap-3 p-3">
                                                            <FileText className="h-8 w-8 flex-shrink-0 text-amber-600" />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate text-sm font-medium">{attachment.name}</div>
                                                                <div className="text-xs opacity-60">{attachment.size ? `${(attachment.size / 1024).toFixed(0)} KB` : ''} · PDF</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <img
                                                            src={attachment.dataUrl}
                                                            alt={attachment.name}
                                                            className="block max-h-64 w-full object-cover"
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {msg.content || (msg.reasoningContent && msg.reasoningContent.trim()) ? (
                                        <div className="space-y-3">
                                            {msg.role === 'assistant' && msg.reasoningContent && msg.reasoningContent.trim() && (
                                                <div className="rounded-xl border border-amber-200/40 dark:border-amber-700/30 bg-amber-50/40 dark:bg-amber-900/10 overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedReasoning(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-amber-100/40 dark:hover:bg-amber-800/20 transition-colors"
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0 text-amber-700 dark:text-amber-300 text-[13px] font-bold">
                                                            <ChevronRight
                                                                size={14}
                                                                className={`shrink-0 transition-transform duration-200 ${expandedReasoning[msg.id] ? 'rotate-90' : ''}`}
                                                            />
                                                            <span className="truncate">{t('chat.reasoning.title')}</span>
                                                        </span>
                                                        <span className="shrink-0 text-[10px] font-bold text-amber-400 dark:text-amber-500 uppercase tracking-wider">
                                                            {expandedReasoning[msg.id] ? t('chat.reasoning.collapse') : t('chat.reasoning.expand')}
                                                        </span>
                                                    </button>
                                                    <div
                                                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${expandedReasoning[msg.id] ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                                    >
                                                        <div className="overflow-hidden">
                                                            {expandedReasoning[msg.id] && (
                                                                <div className="border-t border-amber-200/40 dark:border-amber-700/30 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-amber-700/80 dark:text-amber-200/80 max-h-[20rem] overflow-y-auto custom-scrollbar italic">
                                                                    {msg.reasoningContent}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {msg.content && <div className="tracking-normal">{msg.content}</div>}
                                            {msg.role === 'assistant' && msg.content && (
                                                <div className="mt-3 flex items-center justify-end border-t border-stone-200/30 dark:border-stone-700/30 pt-2">
                                                    <AudioButton
                                                        text={msg.content}
                                                        useTTS={true}
                                                        size={14}
                                                        className="!p-2 hover:bg-white dark:hover:bg-stone-700 border border-transparent hover:border-stone-200 dark:hover:border-stone-600 rounded-lg text-stone-400 hover:text-primary-600 dark:text-stone-500 dark:hover:text-primary-400 transition-all"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        msg.role === 'assistant' && loading && (
                                            <div className="flex gap-2 items-center h-6">
                                                <div className="flex gap-1">
                                                    <div className="w-1.5 h-1.5 bg-amber-400 dark:bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                    <div className="w-1.5 h-1.5 bg-amber-400 dark:bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                    <div className="w-1.5 h-1.5 bg-amber-400 dark:bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                </div>
                                                <span className="text-xs font-bold text-amber-500/80 dark:text-amber-400/80 uppercase tracking-widest animate-pulse">
                                                    {t('chat.loading.thinking')}
                                                </span>
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Memory indicators */}
                                <div className={`flex items-center gap-3 px-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'user' && msg.memorySaved && (
                                        <span className="text-[10px] text-amber-500/80 dark:text-amber-400/80 flex items-center gap-1 font-bold uppercase tracking-wider">
                                            <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" /> {t('chat.memory.savedIndicator')}
                                        </span>
                                    )}
                                    {msg.role === 'assistant' && (msg.memoriesUsed || 0) > 0 && (
                                        <span className="text-[10px] text-amber-500/80 dark:text-amber-400/80 flex items-center gap-1 font-bold uppercase tracking-wider">
                                            <Sparkles size={10} /> {t('chat.memory.retrievedIndicator', { count: msg.memoriesUsed })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Floating Command Bar Input */}
                <div className="flex-none px-6 pb-8 pt-4 bg-transparent relative z-20">
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-50/50 dark:from-stone-950/50 to-transparent pointer-events-none" />
                    <div className="relative max-w-4xl mx-auto">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            className="hidden"
                            onChange={handleAttachmentSelect}
                        />
                        <div
                            className={`bg-white/60 dark:bg-stone-800/60 backdrop-blur-3xl rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/60 dark:border-stone-700/60 p-2 flex flex-col relative focus-within:ring-2 focus-within:ring-amber-500/30 transition-all cursor-text group ${isDragOverComposer ? 'ring-2 ring-amber-500/40 bg-amber-50/30 dark:bg-amber-900/20' : ''}`}
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
                            {pendingAttachments.length > 0 && (
                                <div className="px-3 pt-2 pb-1">
                                    <div className="flex flex-wrap gap-2">
                                        {pendingAttachments.map(attachment => (
                                            <div
                                                key={attachment.id}
                                                className="group relative w-16 h-16 overflow-hidden rounded-2xl border border-white/60 dark:border-stone-700/60 bg-white/40 shadow-sm"
                                            >
                                                {attachment.fileType === 'image' ? (
                                                    <img
                                                        src={attachment.dataUrl}
                                                        alt={attachment.name}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full flex-col items-center justify-center bg-amber-50 dark:bg-amber-900/30 p-1">
                                                        <FileText className="h-5 w-5 text-amber-600" />
                                                        <span className="mt-0.5 truncate text-[8px] text-amber-700 dark:text-amber-400 max-w-full">{attachment.ext?.toUpperCase()}</span>
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removePendingAttachment(attachment.id)
                                                    }}
                                                    className="absolute top-1 right-1 rounded-full bg-stone-900/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                                    title={t('chat.attachments.removeImage')}
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex items-end gap-2 w-full">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        fileInputRef.current?.click()
                                    }}
                                    className="mb-1 flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-2xl text-stone-400 transition-all hover:bg-white/50 dark:hover:bg-stone-700/50 hover:text-amber-600 dark:hover:text-amber-400 border border-transparent hover:border-white/60 dark:hover:border-stone-700/60"
                                    title={t('chat.attachments.attachFile')}
                                >
                                    <Paperclip size={20} />
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
                                    className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-2 py-3 max-h-48 min-h-[44px] resize-none text-[15px] text-stone-800 dark:text-white placeholder-stone-400 font-medium custom-scrollbar"
                                    rows={1}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={(!input.trim() && pendingAttachments.length === 0) || loading || !activeSessionId || !isInitialized}
                                    className="mb-1 flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-2xl bg-stone-900 dark:bg-stone-100 disabled:bg-stone-200 dark:disabled:bg-stone-800 disabled:text-stone-400 dark:disabled:text-stone-600 text-white dark:text-stone-900 transition-all shadow-lg hover:scale-[1.05] active:scale-[0.95] disabled:hover:scale-100 disabled:shadow-none"
                                >
                                    {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" /> : <Send size={18} className="translate-x-[1px]" />}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}
