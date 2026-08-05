import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { Send, Trash2, Sparkles, Plus, MessageSquare, Menu, Edit2, MoreHorizontal, Eraser, Paperclip, X, Languages, RotateCw, Search, BookOpen, FileText, Settings } from 'lucide-react'
import { api, API_PATHS, API_BASE_URL, getClientId, getOwnerTokenHeaders } from '../utils/api'
import MemoryManagementModal from '../components/MemoryManagementModal'
import { LoginModal } from '../components/LoginModal'
import { SubscriptionModal } from '../components/SubscriptionModal'
import EvermemLogo from '../assets/evermind-powered.svg'
import { useAuth } from '../context/AuthContext'
import { useChatSessionSync } from '../hooks/useChatSessionSync'
import { useChatStreaming } from '../hooks/useChatStreaming'
import { useMemoryOverview } from '../hooks/useMemoryOverview'
import { generateId } from '../utils/generateId'
import {
    resolveChatScope,
    getScopedStorageKey,
    buildScopedSessionId,
    isSessionInScope,
    DEFAULT_NEW_CHAT_TITLE,
    LEGACY_MIGRATED_CHAT_TITLE,
    isDefaultNewChatTitle,
} from '../utils/chatScope'
import { ChatMessageItem } from '../components/chat/ChatMessageItem'
import type { ChatSession, Message, Attachment } from '../components/chat/types'

export default function AIChat({ isActive, onOpenTranslation }: { isActive?: boolean, onOpenTranslation?: () => void }) {
    const { t } = useTranslation()
    const { toast, confirmDialog } = useToast()
    const { token } = useAuth()
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [showUpgradeModal, setShowUpgradeModal] = useState(false)
    const [isInitialized, setIsInitialized] = useState(false)
    const [chatScope, setChatScope] = useState(() => resolveChatScope(token))
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [showChatActions, setShowChatActions] = useState(false)
    const [actionsPos, setActionsPos] = useState({ top: 0, right: 0 })
    const actionsBtnRef = useRef<HTMLButtonElement>(null)
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
    const toggleReasoning = useCallback((messageId: string) => {
        setExpandedReasoning(prev => ({ ...prev, [messageId]: !prev[messageId] }))
    }, [])
    const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
    const [isDragOverComposer, setIsDragOverComposer] = useState(false)
    const [memoryPanelOpen, setMemoryPanelOpen] = useState(false)
    const [memoryMgmtOpen, setMemoryMgmtOpen] = useState(false)

    // Streaming message + typing animation caret
    const {
        streamingMsgId,
        streamingContent,
        streamingReasoning,
        setStreamingMsgId,
        resetStreaming,
        startTyping,
        stopTyping,
        cancelTyping,
    } = useChatStreaming()

    // Auto-grow textarea height as the user types
    useEffect(() => {
        const textarea = inputRef.current
        if (!textarea) return
        textarea.style.height = 'auto'
        textarea.style.height = `${textarea.scrollHeight}px`
    }, [input])

    const MAX_ATTACHMENTS = 3
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024
    const MAX_PDF_BYTES = 20 * 1024 * 1024

    const getCommonHeaders = useCallback(() => {
        const headers: Record<string, string> = {
            'X-Client-Id': getClientId(),
            ...getOwnerTokenHeaders(),
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

        // Auto-migrate legacy models to qwen-flash immediately on load
        if (currentProvider === 'dashscope' && (activeModel === 'qwen-plus' || activeModel === 'qwen3.5-flash' || activeModel === 'qwen-flash-latest' || !activeModel) && !localStorage.getItem('qwen_flash_migrated_v2')) {
            activeModel = 'qwen-flash'
            modelsMap[currentProvider] = activeModel
            localStorage.setItem('qwen_flash_migrated_v2', 'true')
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

    useEffect(() => {
        if (!showChatActions) return
        const handleClickOutside = (e: MouseEvent) => {
            if (actionsBtnRef.current?.contains(e.target as Node)) return
            setShowChatActions(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showChatActions])

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
                const dbSessions = await api.get(API_PATHS.AI_CHAT_SESSIONS)
                if (Array.isArray(dbSessions) && dbSessions.length > 0) {
                    loadedSessions = dbSessions.filter((s: ChatSession) => isSessionInScope(s.id, chatScope))
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
                toast(t('chat.attachments.maxAttachments', { count: MAX_ATTACHMENTS }), 'warning')
                break
            }
            const isImage = file.type.startsWith('image/')
            const isPdf = file.type === 'application/pdf'
            if (!isImage && !isPdf) {
                toast(t('chat.attachments.unsupportedType'), 'warning')
                continue
            }
            const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
            if (file.size > limit) {
                const key = isPdf ? 'chat.attachments.pdfTooLarge' : 'chat.attachments.imageTooLarge'
                toast(t(key, { name: file.name }), 'error')
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
                    toast(t('chat.attachments.loadFailed'), 'error')
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
        // Only AI-specific headers; common auth/owner/EverMem headers handled by api.ts
        const headers: Record<string, string> = {}
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

        return headers
    }, [model, provider])

    const {
        memoryOverview,
        memoryOverviewLoading,
        memoryOverviewError,
        memoryOverviewUpdatedAt,
        memoryOverviewDirtyRef,
        memoryOverviewRefreshTimerRef,
        loadMemoryOverview,
    } = useMemoryOverview({
        evermemEnabled,
        getApiHeaders,
        isPanelOpen: memoryPanelOpen,
    })

    const closeMemoryManagement = useCallback(() => {
        setMemoryMgmtOpen(false)
        memoryOverviewDirtyRef.current = true
        void loadMemoryOverview({ force: true, silent: true })
    }, [loadMemoryOverview, memoryOverviewDirtyRef])

    const getDisplaySessionTitle = useCallback((title: string) => {
        if (isDefaultNewChatTitle(title)) return t('chat.session.newChat')
        if (title === LEGACY_MIGRATED_CHAT_TITLE) return t('chat.session.migratedChat')
        return title
    }, [t])

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
    }, [sessions, searchQuery, getDisplaySessionTitle])

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
        if (await confirmDialog(t('chat.confirm.deleteSession'))) {
            try {
                await flushSessionSyncs()
                dropQueuedSessionSync(id)
                await api.delete(API_PATHS.AI_CHAT_SESSION_DELETE(id))
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

    const clearSession = async () => {
        if (!activeSessionId) return;
        if (await confirmDialog(t('chat.confirm.clearSession'))) {
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
        if (!await confirmDialog(t('chat.confirm.clearAllSessions'))) return

        try {
            await flushSessionSyncs()
            clearQueuedSessionSyncs()
            await api.delete(API_PATHS.AI_CHAT_SESSIONS)
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

    const dismissForesight = async (memoryId: string) => {
        try {
            await api.delete(API_PATHS.AI_FORESIGHT_DISMISS(memoryId), {
                headers: getApiHeaders()
            })
            memoryOverviewDirtyRef.current = true
            void loadMemoryOverview({ force: true, silent: true })
        } catch (err) {
            console.error('Failed to dismiss foresight', err)
        }
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
                toast(t('chat.attachments.uploadFailed', { name: pendingAttachments[0]?.name || '' }), 'error')
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

            const response = await api.raw(API_PATHS.AI_CHAT_STREAM, {
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
                    if (response.status === 403 && detail?.required_tier === 'premium') {
                        if (!token) {
                            setShowLoginModal(true)
                        } else {
                            setShowUpgradeModal(true)
                        }
                        throw new Error(detail.message || "Premium required")
                    }
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
            let targetContent = ''
            let targetReasoning = ''
            let memoriesRetrieved = 0
            let memorySaved = false

            // Set the active streaming message ID and start the typing animation loop
            resetStreaming(botMsgId)
            startTyping(
                () => ({ content: targetContent, reasoning: targetReasoning }),
                () => scrollToBottom(true),
            )

            const flushBotStreamUpdate = () => {
                const { content, reasoning } = stopTyping()

                setSessions(prev => prev.map(s => {
                    if (s.id === targetSessionId) {
                        const updatedMessages = s.messages.map(m =>
                            m.id === botMsgId
                                ? {
                                    ...m,
                                    content,
                                    reasoningContent: reasoning
                                }
                                : m
                        )
                        return { ...s, messages: updatedMessages, updatedAt: Date.now() }
                    }
                    return s
                }))
                scrollToBottom(true)
            }

            const handleSsePayload = (payload: string) => {
                if (!payload || payload === '[DONE]') return
                try {
                    const data = JSON.parse(payload)
                    if (data.type === 'token') {
                        const tokenChunk = typeof data.content === 'string' ? data.content : ''
                        targetContent += tokenChunk
                    } else if (data.type === 'reasoning') {
                        const reasoningChunk = typeof data.content === 'string' ? data.content : ''
                        targetReasoning += reasoningChunk
                        if (botMsgId) {
                            setExpandedReasoning(prev => prev[botMsgId!] ? prev : { ...prev, [botMsgId!]: true })
                        }
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
                                content: targetContent,
                                reasoningContent: targetReasoning,
                                memoriesUsed: memoriesRetrieved
                            }
                        } else if (targetContent || targetReasoning) {
                            updatedMessages.push({
                                id: botMsgId || generateId(),
                                role: 'assistant',
                                content: targetContent,
                                reasoningContent: targetReasoning,
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
            cancelTyping()
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
            cancelTyping()
            setLoading(false)
            setStreamingMsgId(null)
        }
    }

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
        <div className="h-[calc(100vh-4rem)] flex animate-fade-in relative rounded-3xl overflow-hidden border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/50 shadow-2xl shadow-slate-200/40 dark:shadow-black/40">
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
                    className="absolute inset-0 z-40 bg-slate-900/15 dark:bg-slate-900/40 backdrop-blur-[1px] lg:bg-transparent lg:backdrop-blur-none transition-opacity duration-300 opacity-100 pointer-events-auto cursor-pointer"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar Drawer */}
            <div className={`
                absolute lg:relative inset-y-0 left-0 z-50
                bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl flex flex-col shadow-2xl lg:shadow-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden
                ${sidebarOpen
                    ? 'translate-x-0 w-72 lg:w-72 opacity-100 lg:opacity-100 border-r border-white/20 dark:border-slate-800/20 lg:border-r lg:border-white/20 lg:dark:border-slate-800/20'
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
                            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-lg shadow-slate-900/10 dark:shadow-black/20 hover:scale-110 active:scale-95 transition-all"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('chat.sidebar.searchPlaceholder', 'Search history...')}
                            className="w-full bg-white/40 dark:bg-slate-800/40 border border-white/60 dark:border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar">
                    {(Object.entries(groupedSessions) as [string, ChatSession[]][]).map(([key, groupSessions]) => {
                        if (groupSessions.length === 0) return null;
                        return (
                            <div key={key} className="space-y-2">
                                <h3 className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="h-px flex-1 bg-slate-200/50 dark:bg-slate-700/50" />
                                    {t(`chat.sidebar.groups.${key}`)}
                                    <span className="h-px flex-1 bg-slate-200/50 dark:bg-slate-700/50" />
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
                                                    : 'border-transparent hover:bg-white/40 dark:hover:bg-slate-800/40'
                                                }
                                            `}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${activeSessionId === session.id ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-110' : 'bg-white/50 dark:bg-slate-800/50 text-slate-400 border border-slate-200/50 dark:border-slate-700/50'}`}>
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
                                                        className="w-full bg-white dark:bg-slate-900 border border-amber-500 rounded-xl px-2 py-1 text-xs text-slate-800 dark:text-white outline-none font-bold"
                                                    />
                                                ) : (
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={`block truncate text-xs font-bold ${activeSessionId === session.id ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                                                {getDisplaySessionTitle(session.title)}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-slate-400/80 dark:text-slate-500 shrink-0">
                                                                {formatSessionTimestamp(session.updatedAt)}
                                                            </span>
                                                        </div>
                                                        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                            {getSessionPreview(session)}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {editingSessionId !== session.id && (
                                                <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => startRenameSession(e, session)}
                                                        className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-all"
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
                                                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-all"
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
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50/30 dark:bg-slate-900/20 relative">
                {/* Header */}
                <div className="flex-none h-16 border-b border-slate-200/30 dark:border-slate-700/30 flex items-center justify-between px-6 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl sticky top-0 z-10">
                    <div className="flex items-center gap-3 min-w-0 flex-shrink-1">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 -ml-2 text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50"
                            title={sidebarOpen ? t('chat.actions.collapseHistory') : t('chat.actions.expandHistory')}
                        >
                            <Menu size={18} />
                        </button>

                        <div className="flex items-center gap-2.5 min-w-0">
                            <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5 flex-shrink-0">
                                <span>{t('chat.header.title')}</span>
                            </h2>
                            <span className="text-slate-200 dark:text-slate-800 text-xs">|</span>
                            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100/80 dark:bg-slate-800/80 text-[11px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200/20 dark:border-slate-700/20">
                                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="truncate max-w-[120px]">{model || t('chat.header.defaultModel')}</span>
                                </span>
                                {evermemEnabled && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-[11px] font-black text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-800/20 tracking-wider uppercase">
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
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/50 bg-white/30 text-xs font-bold text-slate-600 transition-all hover:bg-white/60 hover:border-primary-200 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60 shadow-sm"
                                title={t('sidebar.translationTooltip')}
                            >
                                <Languages size={13} />
                                <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'lg:inline'}`}>{t('sidebar.translation')}</span>
                            </button>
                        )}
                        {evermemEnabled && (
                            <button
                                onClick={() => setMemoryPanelOpen(prev => !prev)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${memoryPanelOpen
                                    ? 'border-amber-300/50 bg-amber-50/50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'border-slate-200/50 bg-white/30 text-slate-600 hover:bg-white/60 hover:border-amber-300 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                    }`}
                                title={t('chat.memory.panel.title')}
                            >
                                <Sparkles size={13} className={memoryPanelOpen ? 'text-amber-500' : 'text-slate-400'} />
                                <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'sm:inline'}`}>{t('chat.memory.panel.button')}</span>
                            </button>
                        )}
                        <button
                            onClick={createNewSession}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:scale-[1.02] active:scale-[0.98] text-xs font-bold rounded-xl transition-all shadow-sm"
                            title={t('chat.actions.newChatTitle')}
                        >
                            <Plus size={14} />
                            <span className={`hidden ${sidebarOpen ? 'xl:inline' : 'sm:inline'}`}>{t('chat.actions.newChat')}</span>
                        </button>

                        <div className="relative">
                            <button
                                ref={actionsBtnRef}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (showChatActions) {
                                        setShowChatActions(false);
                                    } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setActionsPos({ top: rect.bottom + 12, right: window.innerWidth - rect.right });
                                        setShowChatActions(true);
                                    }
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-white/50 dark:hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-200/50 dark:hover:border-slate-700/50"
                                title={t('chat.actions.moreOptions')}
                            >
                                <MoreHorizontal size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Chat Actions Dropdown */}
                {showChatActions && (
                    <div
                        className="fixed z-50 min-w-[200px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 dark:border-slate-800/60 overflow-hidden p-1.5 animate-scale-in"
                        style={{ top: actionsPos.top, right: actionsPos.right }}
                    >
                        <button
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 rounded-xl transition-all text-left font-bold text-xs uppercase tracking-wider"
                            onClick={() => {
                                setShowChatActions(false);
                                clearSession();
                            }}
                        >
                            <Eraser size={16} className="opacity-60" />
                            <span>{t('chat.actions.clearCurrentMessages')}</span>
                        </button>

                        <button
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-all text-left font-bold text-xs uppercase tracking-wider mt-1"
                            onClick={(e) => {
                                setShowChatActions(false);
                                if (activeSessionId) deleteSession(e, activeSessionId);
                            }}
                        >
                            <Trash2 size={16} className="opacity-60" />
                            <span>{t('chat.actions.deleteSessionRecord')}</span>
                        </button>
                    </div>
                )}

                {/* Memory Toast */}
                {memoryToast && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-amber-600 dark:text-amber-400 text-[11px] font-bold px-6 py-3 rounded-2xl shadow-2xl shadow-amber-500/10 flex items-center gap-3 whitespace-nowrap border border-white/60 dark:border-slate-800/60 uppercase tracking-widest">
                            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            {memoryToast}
                        </div>
                    </div>
                )}

                <div className={`absolute inset-y-0 right-0 z-30 w-full max-w-sm border-l border-white/20 dark:border-slate-800/20 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${memoryPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="flex h-full flex-col">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-200/20 dark:border-slate-700/20 px-6 py-6">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    {t('chat.memory.panel.title')}
                                </p>
                                <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
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
                                    onClick={() => setMemoryMgmtOpen(true)}
                                    className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition-all hover:bg-white/50 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-amber-400"
                                    title={t('chat.memory.panel.manage')}
                                    aria-label={t('chat.memory.panel.manage')}
                                >
                                    <Settings size={16} />
                                    <span className="hidden sm:inline">{t('chat.memory.panel.manage')}</span>
                                </button>
                                <button
                                    onClick={() => void loadMemoryOverview({ force: true })}
                                    className="rounded-xl p-2.5 text-slate-400 transition-all hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-amber-500"
                                    title={t('chat.memory.panel.refresh')}
                                >
                                    <RotateCw size={16} className={memoryOverviewLoading ? 'animate-spin' : ''} />
                                </button>
                                <button
                                    onClick={() => setMemoryPanelOpen(false)}
                                    className="rounded-xl p-2.5 text-slate-400 transition-all hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-600"
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
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('chat.memory.panel.loading')}</p>
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
                                    <div className="rounded-2xl border border-slate-200/30 bg-white/40 dark:bg-slate-800/40 p-5 shadow-sm">
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
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
                                                    <div key={item.word} className="rounded-xl border border-white/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 px-3 py-2.5 transition-all hover:bg-white/80 dark:hover:bg-slate-900/60">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                                                    {item.word}
                                                                </p>
                                                                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                                                    {item.meaning || t('chat.memory.panel.noMeaning')}
                                                                </p>
                                                            </div>
                                                            <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${item.is_due ? 'bg-amber-500/10 text-amber-600 border border-amber-200/30' : 'bg-slate-500/10 text-slate-500 border border-slate-200/30'}`}>
                                                                {item.error_count}x
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs font-medium text-slate-400 italic">
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

                                    {(memoryOverview?.foresights?.length ?? 0) > 0 && (
                                        <div className="rounded-2xl border border-blue-200/30 bg-blue-500/5 p-5 shadow-sm">
                                            <p className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-4">
                                                {t('chat.memory.panel.foresightTitle')}
                                            </p>
                                            <div className="space-y-3">
                                                {(memoryOverview?.foresights || []).map((fs, index) => (
                                                    <div key={fs.memory_id || index} className="relative pl-4 border-l-2 border-blue-500/20 pr-6">
                                                        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                                                            {fs.content}
                                                        </p>
                                                        {fs.timestamp && (
                                                            <span className="text-[10px] font-bold text-slate-400 mt-1 block">
                                                                {formatMemoryTimestamp(fs.timestamp)}
                                                            </span>
                                                        )}
                                                        {fs.memory_id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => dismissForesight(fs.memory_id!)}
                                                                className="absolute top-0 right-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all"
                                                                title={t('chat.memory.panel.foresightDismiss')}
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-slate-200/30 bg-white/40 dark:bg-slate-800/40 p-5 shadow-sm">
                                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                                            {t('chat.memory.panel.profileTitle')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {(memoryOverview?.profile_facts || []).length > 0 ? (
                                                memoryOverview?.profile_facts.map((fact, index) => (
                                                    <div key={`${fact}-${index}`} className="rounded-xl border border-white/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {fact}
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs font-medium text-slate-400 italic">
                                                    {t('chat.memory.panel.noProfile')}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200/30 bg-white/40 dark:bg-slate-800/40 p-5 shadow-sm">
                                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
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
                                                            <span className="text-[10px] font-bold text-slate-400">
                                                                {formatMemoryTimestamp(item.timestamp)}
                                                            </span>
                                                        </div>
                                                        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                                                            {item.content}
                                                        </p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs font-medium text-slate-400 italic">
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
                                                        className="w-full text-left rounded-xl bg-white/60 dark:bg-slate-900/40 px-3.5 py-3 text-[13px] font-bold leading-snug text-slate-600 dark:text-slate-300 border border-white/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-900/80 transition-all"
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
                <MemoryManagementModal isOpen={memoryMgmtOpen} onClose={closeMemoryManagement} />

                {/* Messages Area */}
                <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8 custom-scrollbar scroll-smooth relative z-10">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center animate-fade-in select-none px-4">
                            <div className="max-w-lg w-full flex flex-col items-center">
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight text-center">
                                    {t('chat.empty.title')}
                                </h1>
                                <p className="mt-2 text-[15px] text-slate-400 dark:text-slate-500 font-medium text-center">
                                    {t('chat.empty.subtitle')}
                                </p>

                                <div className="mt-8 grid grid-cols-1 gap-3 w-full sm:grid-cols-2">
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
                                            className="group text-left rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white/50 dark:bg-slate-800/30 backdrop-blur-xl p-4 transition-all duration-300 hover:border-amber-400/40 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 hover:shadow-lg hover:shadow-amber-500/5 active:scale-[0.98] sm:p-5"
                                        >
                                            <starter.icon size={20} className="text-slate-400 dark:text-slate-500 group-hover:text-amber-500 transition-colors" />
                                            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                                                {t(starter.titleKey)}
                                            </p>
                                            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                                {t(starter.descKey)}
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                {evermemEnabled && memoryOverview?.review_focus && (
                                    <div className="mt-6 flex items-center gap-2 text-xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                                            {memoryOverview.review_focus.due_count} {t('chat.memory.dueToday', 'due words today')}
                                        </span>
                                        {memoryOverview.review_focus.difficult_count > 0 && (
                                            <>
                                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                                <span className="text-slate-500 dark:text-slate-400 font-medium">
                                                    {memoryOverview.review_focus.difficult_count} {t('chat.memory.difficultWords', 'difficult words')}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => {
                        const isStreamingThis = msg.id === streamingMsgId
                        const displayContent = isStreamingThis ? streamingContent : msg.content
                        const displayReasoning = isStreamingThis ? streamingReasoning : msg.reasoningContent

                        return (
                            <ChatMessageItem
                                key={msg.id}
                                msg={msg}
                                isStreaming={isStreamingThis}
                                displayContent={displayContent}
                                displayReasoning={displayReasoning}
                                isReasoningExpanded={Boolean(expandedReasoning[msg.id])}
                                showLoading={isStreamingThis && loading}
                                reasoningTitle={t('chat.reasoning.title')}
                                reasoningCollapse={t('chat.reasoning.collapse')}
                                reasoningExpand={t('chat.reasoning.expand')}
                                thinkingLabel={t('chat.loading.thinking')}
                                memorySavedLabel={t('chat.memory.savedIndicator')}
                                memoryRetrievedLabel={t('chat.memory.retrievedIndicator', { count: msg.memoriesUsed || 0 })}
                                onToggleReasoning={toggleReasoning}
                            />
                        )
                    })}

                    <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Floating Command Bar Input */}
                <div className="flex-none px-6 pb-8 pt-4 bg-transparent relative z-20">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-50/50 dark:from-slate-950/50 to-transparent pointer-events-none" />
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
                            className={`bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/60 dark:border-slate-700/60 p-2 flex flex-col relative focus-within:ring-2 focus-within:ring-amber-500/30 transition-all cursor-text group ${isDragOverComposer ? 'ring-2 ring-amber-500/40 bg-amber-50/30 dark:bg-amber-900/20' : ''}`}
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
                                                className="group relative w-16 h-16 overflow-hidden rounded-2xl border border-white/60 dark:border-slate-700/60 bg-white/40 shadow-sm"
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
                                                    className="absolute top-1 right-1 rounded-full bg-slate-900/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
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
                                    className="mb-1 flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-2xl text-slate-400 transition-all hover:bg-white/50 dark:hover:bg-slate-700/50 hover:text-amber-600 dark:hover:text-amber-400 border border-transparent hover:border-white/60 dark:hover:border-slate-700/60"
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
                                    className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-2 py-3 max-h-48 min-h-[44px] resize-none text-[15px] text-slate-800 dark:text-white placeholder-slate-400 font-medium custom-scrollbar"
                                    rows={1}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={(!input.trim() && pendingAttachments.length === 0) || loading || !activeSessionId || !isInitialized}
                                    className="mb-1 flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-100 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white dark:text-slate-900 transition-all shadow-lg hover:scale-[1.05] active:scale-[0.95] disabled:hover:scale-100 disabled:shadow-none"
                                >
                                    {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" /> : <Send size={18} className="translate-x-[1px]" />}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
            <SubscriptionModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
        </div>
    )
}
