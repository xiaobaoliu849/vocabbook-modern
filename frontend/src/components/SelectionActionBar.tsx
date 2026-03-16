import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Languages, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import QuickLookupPopup from './QuickLookupPopup'

type QuickAction = 'word' | 'translate' | 'explain'

interface ActionBarState {
    rawText: string
    lookupText: string
    isWord: boolean
    barPosition: { x: number; y: number }
    popupPosition: { x: number; y: number }
}

interface PopupState {
    text: string
    type: QuickAction
    position: { x: number; y: number }
}

const MAX_SELECTION_LENGTH = 180

const normalizeSelectedText = (text: string) => text.replace(/\s+/g, ' ').trim()

const sanitizeWordCandidate = (text: string) => text.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '')

const isEditableNode = (node: Node | null) => {
    if (!node) return false
    const element = node instanceof Element ? node : node.parentElement
    if (!element) return false
    return Boolean(element.closest('input, textarea, [contenteditable="true"], [data-selection-overlay="true"]'))
}

const isWordLike = (text: string) => /^[A-Za-z][A-Za-z'-]{0,47}$/.test(text)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export default function SelectionActionBar() {
    const { t } = useTranslation()
    const [actionBar, setActionBar] = useState<ActionBarState | null>(null)
    const [popup, setPopup] = useState<PopupState | null>(null)
    const toolbarRef = useRef<HTMLDivElement>(null)
    const suppressNextSelectionSyncRef = useRef(false)

    const hideActionBar = useCallback(() => {
        setActionBar(null)
    }, [])

    const buildActionBarState = useCallback((selection: Selection, preferredPoint?: { x: number; y: number }) => {
        if (!selection.rangeCount || selection.isCollapsed) return null
        if (isEditableNode(selection.anchorNode) || isEditableNode(selection.focusNode)) return null

        const rawText = normalizeSelectedText(selection.toString())
        if (!rawText || rawText.length > MAX_SELECTION_LENGTH) return null

        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return null

        const lookupText = sanitizeWordCandidate(rawText)
        const isWord = !rawText.includes(' ') && isWordLike(lookupText)

        const centerX = rect.left + rect.width / 2
        const popupX = clamp(centerX, 24, window.innerWidth - 24)
        const popupY = rect.bottom

        const baseX = preferredPoint?.x ?? centerX
        const baseY = preferredPoint?.y ?? rect.top - 14
        const toolbarWidth = isWord ? 250 : 178
        const x = clamp(baseX - toolbarWidth / 2, 12, window.innerWidth - toolbarWidth - 12)
        const y = preferredPoint
            ? clamp(baseY, 12, window.innerHeight - 56)
            : (rect.top > 72 ? rect.top - 52 : rect.bottom + 12)

        return {
            rawText,
            lookupText: isWord ? lookupText : rawText,
            isWord,
            barPosition: { x, y },
            popupPosition: { x: popupX, y: popupY },
        }
    }, [])

    const syncFromSelection = useCallback((preferredPoint?: { x: number; y: number }) => {
        if (suppressNextSelectionSyncRef.current) {
            suppressNextSelectionSyncRef.current = false
            return
        }

        const selection = window.getSelection()
        if (!selection) {
            hideActionBar()
            return
        }

        const nextState = buildActionBarState(selection, preferredPoint)
        if (!nextState) {
            hideActionBar()
            return
        }

        setPopup(null)
        setActionBar(nextState)
    }, [buildActionBarState, hideActionBar])

    useEffect(() => {
        const handleMouseUp = (event: MouseEvent) => {
            const target = event.target as Element | null
            if (target?.closest('[data-selection-overlay="true"]')) {
                return
            }
            window.requestAnimationFrame(() => syncFromSelection())
        }

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                hideActionBar()
                setPopup(null)
                return
            }
            window.requestAnimationFrame(() => syncFromSelection())
        }

        const handleScrollOrResize = () => {
            hideActionBar()
        }

        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('keyup', handleKeyUp)
        window.addEventListener('scroll', handleScrollOrResize, true)
        window.addEventListener('resize', handleScrollOrResize)
        return () => {
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('scroll', handleScrollOrResize, true)
            window.removeEventListener('resize', handleScrollOrResize)
        }
    }, [buildActionBarState, hideActionBar, syncFromSelection])

    useEffect(() => {
        if (!actionBar) return

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node
            if (toolbarRef.current?.contains(target)) return
            hideActionBar()
        }

        document.addEventListener('mousedown', handlePointerDown)
        return () => document.removeEventListener('mousedown', handlePointerDown)
    }, [actionBar, hideActionBar])

    const actions = useMemo(() => {
        if (!actionBar) return []
        const base = [
            {
                id: 'explain' as QuickAction,
                label: t('quickLookup.actions.explain', '解释'),
                icon: <Sparkles size={14} />,
                accent: 'from-amber-500/18 to-orange-500/12 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/70',
            },
            {
                id: 'translate' as QuickAction,
                label: t('quickLookup.actions.translate', '翻译'),
                icon: <Languages size={14} />,
                accent: 'from-sky-500/18 to-cyan-500/12 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/70',
            },
        ]
        if (actionBar.isWord) {
            base.unshift({
                id: 'word' as QuickAction,
                label: t('quickLookup.actions.lookup', '查询'),
                icon: <BookOpen size={14} />,
                accent: 'from-primary-500/18 to-primary-400/10 text-primary-700 dark:text-primary-300 border-primary-200/80 dark:border-primary-800/70',
            })
        }
        return base
    }, [actionBar, t])

    const openPopup = (type: QuickAction) => {
        if (!actionBar) return
        suppressNextSelectionSyncRef.current = true
        const text = type === 'translate' ? actionBar.rawText : actionBar.lookupText
        setPopup({
            text,
            type,
            position: actionBar.popupPosition,
        })
        hideActionBar()
    }

    return (
        <>
            {actionBar && (
                <div
                    ref={toolbarRef}
                    data-selection-overlay="true"
                    className="fixed z-[10001] animate-scale-in"
                    style={{ left: actionBar.barPosition.x, top: actionBar.barPosition.y }}
                >
                    <div className="flex items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/96 p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/96 dark:shadow-[0_18px_42px_rgba(0,0,0,0.42)]">
                        {actions.map(action => (
                            <button
                                key={action.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => openPopup(action.id)}
                                className={`group inline-flex items-center gap-2 rounded-xl border bg-linear-to-r px-3 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm ${action.accent}`}
                            >
                                <span className="opacity-80 transition-opacity group-hover:opacity-100">{action.icon}</span>
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {popup && (
                <QuickLookupPopup
                    text={popup.text}
                    type={popup.type}
                    position={popup.position}
                    onClose={() => setPopup(null)}
                />
            )}
        </>
    )
}
