import { safeStorage } from '../utils/safeStorage'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { api, API_PATHS, API_BASE_URL, getClientId, getOwnerTokenHeaders } from '../utils/api'
import { LoginModal } from '../components/LoginModal'
import { SubscriptionModal } from '../components/SubscriptionModal'
import { useAuth } from '../context/AuthContext'
import { useChatSessionSync } from '../hooks/useChatSessionSync'
import { useChatStreaming } from '../hooks/useChatStreaming'
import { useMemoryOverview } from '../hooks/useMemoryOverview'
import { generateId } from '../utils/generateId'
import { getActiveAiModel } from '../utils/aiModels'
import {
    resolveChatScope,
    getScopedStorageKey,
    buildScopedSessionId,
    isSessionInScope,
    DEFAULT_NEW_CHAT_TITLE,
    LEGACY_MIGRATED_CHAT_TITLE,
    isDefaultNewChatTitle,
} from '../utils/chatScope'
import { ChatHeader } from '../components/chat/ChatHeader'
import { ChatMessages } from '../components/chat/ChatMessages'
import { ChatSidebar } from '../components/chat/ChatSidebar'
import { Composer } from '../components/chat/Composer'
import { MemoryPanel } from '../components/chat/MemoryPanel'
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
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const isNearBottomRef = useRef(true)
    const wasActiveRef = useRef(false)
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') return true
        const saved = safeStorage.get('chat_sidebar_open')
        if (saved !== null) return saved === 'true'
        return window.innerWidth >= 1024
    })
    const [searchQuery, setSearchQuery] = useState('')
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)

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
    const [memoryPanelOpen, setMemoryPanelOpen] = useState(false)
    // Cancel hook for the active chat stream: a half-open connection (sleep/
    // VPN drop) otherwise blocks in reader.read() forever with loading stuck.
    const streamCancelRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        return () => {
            streamCancelRef.current?.()
            streamCancelRef.current = null
        }
    }, [])

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
        const currentProvider = safeStorage.get('ai_provider') || 'dashscope'
        setProvider(currentProvider)
        const activeModel = getActiveAiModel(currentProvider)
        setModel(activeModel)
        setEvermemEnabled(safeStorage.get('evermem_enabled') === 'true')
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
                const dbSessions = await api.get(API_PATHS.AI_CHAT_SESSIONS)
                if (Array.isArray(dbSessions) && dbSessions.length > 0) {
                    loadedSessions = dbSessions.filter((s: ChatSession) => isSessionInScope(s.id, chatScope))
                }
            } catch (err) {
                console.error("Failed to load chat sessions from API", err)
            }

            // Fallback to localStorage if API empty or failed
            if (loadedSessions.length === 0) {
                const savedSessions = safeStorage.get(getScopedStorageKey(chatScope))
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
                const legacySessions = safeStorage.get('chat_sessions')
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
                const oldHistory = safeStorage.get('chat_history')
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
            // Base64 image attachments easily exceed the ~5MB localStorage
            // quota; without this guard the throw inside the effect would
            // kill every subsequent session-change persistence.
            try {
                safeStorage.set(scopedStorageKey, JSON.stringify(sessions))
            } catch (error) {
                console.warn('Failed to persist chat sessions locally (quota?)', error)
            }
        } else {
            try {
                safeStorage.remove(scopedStorageKey)
            } catch {
                // ignore
            }
        }
    }, [sessions, isInitialized, chatScope])

    useEffect(() => {
        safeStorage.set('chat_sidebar_open', String(sidebarOpen))
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
            // Truncate inside the functional update: two concurrent batches
            // both read the same stale pendingAttachments and together slip
            // past MAX_ATTACHMENTS.
            setPendingAttachments(prev => {
                const room = MAX_ATTACHMENTS - prev.length
                if (room <= 0) return prev
                return [...prev, ...accepted.slice(0, room)]
            })
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

        const savedBasesStr = safeStorage.get('ai_bases_map')
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

        const savedKeysStr = safeStorage.get('ai_api_keys_map')
        let keysMap: Record<string, string> = {}
        if (savedKeysStr) {
            try {
                keysMap = JSON.parse(savedKeysStr)
            } catch {
                // Ignore malformed saved key config.
            }
        }
        const apiKey = keysMap[provider] || safeStorage.get('ai_api_key') || ''
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

    const reloadMemoryAfterManagement = useCallback(() => {
        memoryOverviewDirtyRef.current = true
        void loadMemoryOverview({ force: true, silent: true })
    }, [loadMemoryOverview, memoryOverviewDirtyRef])

    const handlePickSuggestion = useCallback((text: string) => {
        setInput(text)
        setMemoryPanelOpen(false)
        inputRef.current?.focus()
    }, [])

    const handlePickStarter = useCallback((prompt: string) => {
        setInput(prompt)
        setTimeout(() => inputRef.current?.focus(), 0)
    }, [])

    const getDisplaySessionTitle = useCallback((title: string) => {
        if (isDefaultNewChatTitle(title)) return t('chat.session.newChat')
        if (title === LEGACY_MIGRATED_CHAT_TITLE) return t('chat.session.migratedChat')
        return title
    }, [t])

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

    const deleteSession = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        if (await confirmDialog(t('chat.confirm.deleteSession'))) {
            try {
                await flushSessionSyncs()
                dropQueuedSessionSync(id)
                await api.delete(API_PATHS.AI_CHAT_SESSION_DELETE(id))
            } catch (err) { console.error("Failed to delete session from DB", err) }

            // Decide outside the updater: StrictMode invokes updaters twice,
            // so side effects inside them ran twice (two blank sessions).
            const wasActive = activeSessionId === id
            const nextFirstId = sessions.find(s => s.id !== id)?.id ?? null
            const remainingCount = sessions.reduce((n, s) => (s.id !== id ? n + 1 : n), 0)
            setSessions(prev => prev.filter(s => s.id !== id))
            if (wasActive) {
                setActiveSessionId(nextFirstId)
            }
            if (remainingCount === 0) {
                setTimeout(() => createNewSession(), 0)
            }
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

        // Claim the single-flight lock BEFORE any await. With attachments the
        // presign round-trip below can take seconds; setting `loading` only
        // after it left a window where a double-click / second Enter passed
        // the guard and sent the same message twice.
        setLoading(true)

        // Presign all pending attachments to Evermind S3
        let uploadedAttachments: Attachment[] = []
        if (pendingAttachments.length > 0) {
            try {
                uploadedAttachments = await Promise.all(
                    pendingAttachments.map(att => presignAttachment(att))
                )
            } catch (err) {
                console.error('Presign upload failed', err)
                setLoading(false)
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
                let premiumRequired = false
                try {
                    const parsed = raw ? JSON.parse(raw) : null
                    const detail = parsed?.detail
                    if (response.status === 403 && detail?.required_tier === 'premium') {
                        // Set a flag, don't throw: throwing inside this try hit
                        // the catch below, which replaced the message with the
                        // raw JSON — displayed AND persisted into the session.
                        premiumRequired = true
                        detailedMessage = detail.message || "Premium required"
                    } else if (typeof detail === 'string' && detail.trim()) {
                        detailedMessage = detail
                    } else if (detail?.message && typeof detail.message === 'string') {
                        detailedMessage = detail.message
                    } else if (raw && raw.trim()) {
                        detailedMessage = raw
                    }
                } catch {
                    if (!premiumRequired && raw && raw.trim()) {
                        detailedMessage = raw
                    }
                }
                if (premiumRequired) {
                    if (!token) {
                        setShowLoginModal(true)
                    } else {
                        setShowUpgradeModal(true)
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

            // Idle-timeout the stream: if no chunk arrives within the window,
            // cancel the reader and surface an error instead of hanging on a
            // dead connection with the composer locked.
            const STREAM_IDLE_TIMEOUT_MS = 60_000
            const cancelStream = () => {
                try {
                    reader.cancel()
                } catch {
                    // Reader already closed/cancelled.
                }
            }
            streamCancelRef.current = cancelStream

            const readChunkWithIdleTimeout = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
                let timerId: number | null = null
                return Promise.race([
                    reader.read(),
                    new Promise<never>((_, reject) => {
                        timerId = window.setTimeout(
                            () => {
                                cancelStream()
                                reject(new Error('stream_idle_timeout'))
                            },
                            STREAM_IDLE_TIMEOUT_MS,
                        )
                    }),
                ]).finally(() => {
                    if (timerId !== null) window.clearTimeout(timerId)
                })
            }

            while (!done) {
                const { value, done: readerDone } = await readChunkWithIdleTimeout()
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
            streamCancelRef.current = null
            cancelTyping()
            setLoading(false)
            setStreamingMsgId(null)
        }
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex animate-fade-in relative rounded-3xl overflow-hidden border border-warm-200/60 dark:border-warm-700/60 bg-warm-50/50 dark:bg-warm-900/50 shadow-2xl shadow-warm-200/40 dark:shadow-black/40">
            {/* Immersive Animated Background */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-rose-400/10 dark:bg-rose-900/10 blur-[120px] animate-pulse-slow" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-amber-400/10 dark:bg-amber-900/10 blur-[120px] animate-pulse-slow" style={{ animationDelay: '3s' }} />
                <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full bg-amber-400/10 dark:bg-amber-900/5 blur-[100px] animate-pulse-slow" style={{ animationDelay: '5s' }} />
            </div>

            <ChatSidebar
                isOpen={sidebarOpen}
                sessions={sessions}
                groupedSessions={groupedSessions}
                activeSessionId={activeSessionId}
                searchQuery={searchQuery}
                editingSessionId={editingSessionId}
                editingTitle={editingTitle}
                onClose={() => setSidebarOpen(false)}
                onNewSession={createNewSession}
                onSearchChange={setSearchQuery}
                onSelectSession={(sessionId) => {
                    setActiveSessionId(sessionId)
                    if (window.innerWidth < 1024) setSidebarOpen(false)
                }}
                onStartRename={startRenameSession}
                onCommitRename={commitRename}
                onCancelRename={cancelRename}
                onEditingTitleChange={setEditingTitle}
                onDeleteSession={deleteSession}
                onClearAll={clearAllSessions}
            />

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-warm-50/30 dark:bg-warm-900/20 relative">
                {/* Header + Chat Actions Dropdown */}
                <ChatHeader
                    sidebarOpen={sidebarOpen}
                    model={model}
                    evermemEnabled={evermemEnabled}
                    memoryPanelOpen={memoryPanelOpen}
                    onOpenTranslation={onOpenTranslation}
                    onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                    onToggleMemoryPanel={() => setMemoryPanelOpen(prev => !prev)}
                    onNewSession={createNewSession}
                    onClearSession={clearSession}
                    onDeleteActiveSession={(e) => {
                        if (activeSessionId) deleteSession(e, activeSessionId);
                    }}
                />

                {/* Memory Toast */}
                {memoryToast && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
                        <div className="bg-white/80 dark:bg-warm-900/80 backdrop-blur-xl text-amber-600 dark:text-amber-400 text-[11px] font-bold px-6 py-3 rounded-2xl shadow-2xl shadow-amber-500/10 flex items-center gap-3 whitespace-nowrap border border-white/60 dark:border-warm-800/60 uppercase tracking-widest">
                            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            {memoryToast}
                        </div>
                    </div>
                )}

                <MemoryPanel
                    isOpen={memoryPanelOpen}
                    memoryOverview={memoryOverview}
                    loading={memoryOverviewLoading}
                    error={memoryOverviewError}
                    updatedAt={memoryOverviewUpdatedAt}
                    weakWords={weakWords}
                    canStartWeakWordPractice={canStartWeakWordPractice}
                    onClose={() => setMemoryPanelOpen(false)}
                    onRefresh={() => void loadMemoryOverview({ force: true })}
                    onPractice={startWeakWordPractice}
                    onDismissForesight={dismissForesight}
                    onPickSuggestion={handlePickSuggestion}
                    onMemoryDataChanged={reloadMemoryAfterManagement}
                />

                {/* Messages Area */}
                <ChatMessages
                    messages={messages}
                    streamingMsgId={streamingMsgId}
                    streamingContent={streamingContent}
                    streamingReasoning={streamingReasoning}
                    expandedReasoning={expandedReasoning}
                    loading={loading}
                    evermemEnabled={evermemEnabled}
                    memoryOverview={memoryOverview}
                    containerRef={messagesContainerRef}
                    endRef={messagesEndRef}
                    onScroll={handleMessagesScroll}
                    onToggleReasoning={toggleReasoning}
                    onPickStarter={handlePickStarter}
                />

                {/* Floating Command Bar Input */}
                <Composer
                    input={input}
                    pendingAttachments={pendingAttachments}
                    loading={loading}
                    activeSessionId={activeSessionId}
                    isInitialized={isInitialized}
                    inputRef={inputRef}
                    onInputChange={setInput}
                    onSend={handleSend}
                    onFileSelect={handleAttachmentSelect}
                    onPaste={handleComposerPaste}
                    onDrop={handleComposerDrop}
                    onRemoveAttachment={removePendingAttachment}
                />
            </div>

            <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
            <SubscriptionModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
        </div>
    )
}
