export type ShortcutBinding = string

export type ShortcutId =
    | 'desktop.toggleWindow'
    | 'app.toggleHelp'
    | 'app.navigateAdd'
    | 'app.navigateList'
    | 'app.navigateReview'
    | 'app.navigateChat'
    | 'app.navigateStats'
    | 'app.navigateSettings'
    | 'common.closeDialog'
    | 'add.addWord'
    | 'add.generateExample'
    | 'add.playAudio'
    | 'review.flipCard'
    | 'review.flipBack'
    | 'review.playAudio'
    | 'review.switchMode'
    | 'review.toggleHint'
    | 'review.rate1'
    | 'review.rate2'
    | 'review.rate3'
    | 'review.rate4'
    | 'review.rate5'
    | 'review.choice1'
    | 'review.choice2'
    | 'review.choice3'
    | 'review.choice4'
    | 'list.focusSearch'
    | 'list.selectPrevious'
    | 'list.selectNext'
    | 'list.viewDetails'
    | 'list.deleteWord'
    | 'list.markMastered'
    | 'list.playAudio'
    | 'list.previousPage'
    | 'list.nextPage'

export type ShortcutGroupId = 'desktop' | 'navigation' | 'review' | 'wordList' | 'addWord' | 'common'

export interface ShortcutDefinition {
    id: ShortcutId
    group: ShortcutGroupId
    labelKey: string
    fallbackLabel: string
    defaultBindings: ShortcutBinding[]
    allowMultiple?: boolean
    desktopOnly?: boolean
}

export interface ShortcutGroupDefinition {
    id: ShortcutGroupId
    titleKey: string
    fallbackTitle: string
    shortcutIds: ShortcutId[]
}

export type ShortcutSettings = Record<ShortcutId, ShortcutBinding[]>

const modifierTokens = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const
type ModifierToken = typeof modifierTokens[number]

const punctuationCodeFallbacks: Record<string, string> = {
    '/': 'Slash',
    '\\': 'Backslash',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    ';': 'Semicolon',
    '\'': 'Quote',
    ',': 'Comma',
    '.': 'Period',
    '-': 'Minus',
    '=': 'Equal',
    '`': 'Backquote',
}

const keyDisplayLabels: Record<string, string> = {
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    Space: 'Space',
    Delete: 'Delete',
    Backspace: 'Backspace',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: '\'',
    Comma: ',',
    Period: '.',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
}

export const shortcutGroups: ShortcutGroupDefinition[] = [
    {
        id: 'desktop',
        titleKey: 'shortcuts.global',
        fallbackTitle: 'Desktop',
        shortcutIds: ['desktop.toggleWindow'],
    },
    {
        id: 'navigation',
        titleKey: 'shortcuts.globalNavigation',
        fallbackTitle: 'Global Navigation',
        shortcutIds: [
            'app.navigateAdd',
            'app.navigateList',
            'app.navigateReview',
            'app.navigateChat',
            'app.navigateStats',
            'app.navigateSettings',
            'app.toggleHelp',
        ],
    },
    {
        id: 'review',
        titleKey: 'shortcuts.reviewMode',
        fallbackTitle: 'Review Mode',
        shortcutIds: [
            'review.flipCard',
            'review.flipBack',
            'review.playAudio',
            'review.switchMode',
            'review.toggleHint',
            'review.rate1',
            'review.rate2',
            'review.rate3',
            'review.rate4',
            'review.rate5',
            'review.choice1',
            'review.choice2',
            'review.choice3',
            'review.choice4',
        ],
    },
    {
        id: 'wordList',
        titleKey: 'sidebar.list',
        fallbackTitle: 'Word List',
        shortcutIds: [
            'list.focusSearch',
            'list.selectPrevious',
            'list.selectNext',
            'list.viewDetails',
            'list.deleteWord',
            'list.markMastered',
            'list.playAudio',
            'list.previousPage',
            'list.nextPage',
        ],
    },
    {
        id: 'addWord',
        titleKey: 'sidebar.add',
        fallbackTitle: 'Vocabulary Hub',
        shortcutIds: ['add.addWord', 'add.generateExample', 'add.playAudio'],
    },
    {
        id: 'common',
        titleKey: 'shortcuts.common',
        fallbackTitle: 'Common',
        shortcutIds: ['common.closeDialog'],
    },
]

export const shortcutDefinitions: ShortcutDefinition[] = [
    {
        id: 'desktop.toggleWindow',
        group: 'desktop',
        labelKey: 'shortcuts.showHideWindow',
        fallbackLabel: 'Show / Hide Window',
        defaultBindings: ['Ctrl+Alt+KeyV'],
        allowMultiple: false,
        desktopOnly: true,
    },
    {
        id: 'app.toggleHelp',
        group: 'navigation',
        labelKey: 'shortcuts.toggleHelp',
        fallbackLabel: 'Show / Hide Help',
        defaultBindings: ['Shift+Slash'],
        allowMultiple: false,
    },
    {
        id: 'app.navigateAdd',
        group: 'navigation',
        labelKey: 'sidebar.add',
        fallbackLabel: 'Vocabulary Hub',
        defaultBindings: ['Ctrl+Digit1'],
        allowMultiple: false,
    },
    {
        id: 'app.navigateList',
        group: 'navigation',
        labelKey: 'sidebar.list',
        fallbackLabel: 'Word List',
        defaultBindings: ['Ctrl+Digit2'],
        allowMultiple: false,
    },
    {
        id: 'app.navigateReview',
        group: 'navigation',
        labelKey: 'sidebar.review',
        fallbackLabel: 'Smart Review',
        defaultBindings: ['Ctrl+Digit3'],
        allowMultiple: false,
    },
    {
        id: 'app.navigateChat',
        group: 'navigation',
        labelKey: 'sidebar.chat',
        fallbackLabel: 'AI Partner',
        defaultBindings: ['Ctrl+Digit4'],
        allowMultiple: false,
    },
    {
        id: 'app.navigateStats',
        group: 'navigation',
        labelKey: 'sidebar.stats',
        fallbackLabel: 'Statistics',
        defaultBindings: ['Ctrl+Digit5'],
        allowMultiple: false,
    },
    {
        id: 'app.navigateSettings',
        group: 'navigation',
        labelKey: 'sidebar.settings',
        fallbackLabel: 'Settings',
        defaultBindings: ['Ctrl+Digit6'],
        allowMultiple: false,
    },
    {
        id: 'common.closeDialog',
        group: 'common',
        labelKey: 'shortcuts.closeModal',
        fallbackLabel: 'Close Dialog',
        defaultBindings: ['Escape'],
        allowMultiple: false,
    },
    {
        id: 'add.addWord',
        group: 'addWord',
        labelKey: 'shortcuts.addToVocabBook',
        fallbackLabel: 'Add to VocabBook',
        defaultBindings: ['Ctrl+Enter'],
        allowMultiple: false,
    },
    {
        id: 'add.generateExample',
        group: 'addWord',
        labelKey: 'shortcuts.generateExample',
        fallbackLabel: 'Generate Example with AI',
        defaultBindings: ['Ctrl+KeyG'],
        allowMultiple: false,
    },
    {
        id: 'add.playAudio',
        group: 'addWord',
        labelKey: 'shortcuts.playPronunciation',
        fallbackLabel: 'Play Pronunciation',
        defaultBindings: ['Ctrl+KeyP'],
        allowMultiple: false,
    },
    {
        id: 'review.flipCard',
        group: 'review',
        labelKey: 'shortcuts.flipCardDetailed',
        fallbackLabel: 'Reveal Answer / Flip Card',
        defaultBindings: ['Space', 'ArrowRight'],
    },
    {
        id: 'review.flipBack',
        group: 'review',
        labelKey: 'shortcuts.flipBack',
        fallbackLabel: 'Flip Back',
        defaultBindings: ['ArrowLeft'],
        allowMultiple: false,
    },
    {
        id: 'review.playAudio',
        group: 'review',
        labelKey: 'shortcuts.playPronunciation',
        fallbackLabel: 'Play Pronunciation',
        defaultBindings: ['KeyP', 'KeyR'],
    },
    {
        id: 'review.switchMode',
        group: 'review',
        labelKey: 'shortcuts.switchReviewMode',
        fallbackLabel: 'Switch Review Mode',
        defaultBindings: ['Tab'],
        allowMultiple: false,
    },
    {
        id: 'review.toggleHint',
        group: 'review',
        labelKey: 'shortcuts.showSpellingHint',
        fallbackLabel: 'Show Spelling Hint',
        defaultBindings: ['KeyH'],
        allowMultiple: false,
    },
    {
        id: 'review.rate1',
        group: 'review',
        labelKey: 'shortcuts.rate1',
        fallbackLabel: 'Rate 1',
        defaultBindings: ['Digit1'],
        allowMultiple: false,
    },
    {
        id: 'review.rate2',
        group: 'review',
        labelKey: 'shortcuts.rate2',
        fallbackLabel: 'Rate 2',
        defaultBindings: ['Digit2'],
        allowMultiple: false,
    },
    {
        id: 'review.rate3',
        group: 'review',
        labelKey: 'shortcuts.rate3',
        fallbackLabel: 'Rate 3',
        defaultBindings: ['Digit3'],
        allowMultiple: false,
    },
    {
        id: 'review.rate4',
        group: 'review',
        labelKey: 'shortcuts.rate4',
        fallbackLabel: 'Rate 4',
        defaultBindings: ['Digit4'],
        allowMultiple: false,
    },
    {
        id: 'review.rate5',
        group: 'review',
        labelKey: 'shortcuts.rate5',
        fallbackLabel: 'Rate 5',
        defaultBindings: ['Digit5'],
        allowMultiple: false,
    },
    {
        id: 'review.choice1',
        group: 'review',
        labelKey: 'shortcuts.chooseOption1',
        fallbackLabel: 'Choose Option 1',
        defaultBindings: ['Digit1'],
        allowMultiple: false,
    },
    {
        id: 'review.choice2',
        group: 'review',
        labelKey: 'shortcuts.chooseOption2',
        fallbackLabel: 'Choose Option 2',
        defaultBindings: ['Digit2'],
        allowMultiple: false,
    },
    {
        id: 'review.choice3',
        group: 'review',
        labelKey: 'shortcuts.chooseOption3',
        fallbackLabel: 'Choose Option 3',
        defaultBindings: ['Digit3'],
        allowMultiple: false,
    },
    {
        id: 'review.choice4',
        group: 'review',
        labelKey: 'shortcuts.chooseOption4',
        fallbackLabel: 'Choose Option 4',
        defaultBindings: ['Digit4'],
        allowMultiple: false,
    },
    {
        id: 'list.focusSearch',
        group: 'wordList',
        labelKey: 'shortcuts.quickSearch',
        fallbackLabel: 'Quick Search',
        defaultBindings: ['Slash'],
        allowMultiple: false,
    },
    {
        id: 'list.selectPrevious',
        group: 'wordList',
        labelKey: 'shortcuts.selectPreviousWord',
        fallbackLabel: 'Select Previous Word',
        defaultBindings: ['ArrowUp'],
        allowMultiple: false,
    },
    {
        id: 'list.selectNext',
        group: 'wordList',
        labelKey: 'shortcuts.selectNextWord',
        fallbackLabel: 'Select Next Word',
        defaultBindings: ['ArrowDown'],
        allowMultiple: false,
    },
    {
        id: 'list.viewDetails',
        group: 'wordList',
        labelKey: 'shortcuts.viewDetails',
        fallbackLabel: 'View Details',
        defaultBindings: ['Enter'],
        allowMultiple: false,
    },
    {
        id: 'list.deleteWord',
        group: 'wordList',
        labelKey: 'shortcuts.deleteWord',
        fallbackLabel: 'Delete Word',
        defaultBindings: ['Delete'],
        allowMultiple: false,
    },
    {
        id: 'list.markMastered',
        group: 'wordList',
        labelKey: 'shortcuts.markMastered',
        fallbackLabel: 'Mark as Mastered',
        defaultBindings: ['KeyM'],
        allowMultiple: false,
    },
    {
        id: 'list.playAudio',
        group: 'wordList',
        labelKey: 'shortcuts.playPronunciation',
        fallbackLabel: 'Play Pronunciation',
        defaultBindings: ['KeyP'],
        allowMultiple: false,
    },
    {
        id: 'list.previousPage',
        group: 'wordList',
        labelKey: 'shortcuts.previousPage',
        fallbackLabel: 'Previous Page',
        defaultBindings: ['ArrowLeft'],
        allowMultiple: false,
    },
    {
        id: 'list.nextPage',
        group: 'wordList',
        labelKey: 'shortcuts.nextPage',
        fallbackLabel: 'Next Page',
        defaultBindings: ['ArrowRight'],
        allowMultiple: false,
    },
]

export const shortcutDefinitionMap = shortcutDefinitions.reduce<Record<ShortcutId, ShortcutDefinition>>((acc, definition) => {
    acc[definition.id] = definition
    return acc
}, {} as Record<ShortcutId, ShortcutDefinition>)

export function createDefaultShortcutSettings(): ShortcutSettings {
    return shortcutDefinitions.reduce<ShortcutSettings>((acc, definition) => {
        acc[definition.id] = [...definition.defaultBindings]
        return acc
    }, {} as ShortcutSettings)
}

export const defaultShortcutSettings = createDefaultShortcutSettings()

function isModifierOnlyKey(key: string) {
    return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta'
}

function keyTokenFromEvent(event: Pick<KeyboardEvent, 'key' | 'code'>): string | null {
    if (event.code && /^Key[A-Z]$/.test(event.code)) {
        return event.code
    }

    if (event.code && /^Digit[0-9]$/.test(event.code)) {
        return event.code
    }

    if (event.code && [
        'Enter',
        'Escape',
        'Tab',
        'Space',
        'Delete',
        'Backspace',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Slash',
        'Backslash',
        'BracketLeft',
        'BracketRight',
        'Semicolon',
        'Quote',
        'Comma',
        'Period',
        'Minus',
        'Equal',
        'Backquote',
    ].includes(event.code)) {
        return event.code
    }

    if (event.key.length === 1) {
        if (/^[a-z]$/i.test(event.key)) {
            return `Key${event.key.toUpperCase()}`
        }
        if (/^[0-9]$/.test(event.key)) {
            return `Digit${event.key}`
        }
        return punctuationCodeFallbacks[event.key] ?? null
    }

    return null
}

export function normalizeShortcutBinding(binding: string): ShortcutBinding | null {
    if (!binding) return null

    const tokens = binding
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean)

    if (tokens.length === 0) return null

    const modifiers = new Set<ModifierToken>()
    let keyToken: string | null = null

    for (const token of tokens) {
        if ((modifierTokens as readonly string[]).includes(token)) {
            modifiers.add(token as ModifierToken)
            continue
        }

        keyToken = token
    }

    if (!keyToken) return null

    const orderedModifiers = modifierTokens.filter((token) => modifiers.has(token))
    return [...orderedModifiers, keyToken].join('+')
}

export function dedupeShortcutBindings(bindings: ShortcutBinding[]) {
    const unique = new Set<string>()
    return bindings.filter((binding) => {
        const normalized = normalizeShortcutBinding(binding)
        if (!normalized || unique.has(normalized)) {
            return false
        }
        unique.add(normalized)
        return true
    })
}

export function bindingFromKeyboardEvent(
    event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>,
): ShortcutBinding | null {
    if (isModifierOnlyKey(event.key)) {
        return null
    }

    const keyToken = keyTokenFromEvent(event)
    if (!keyToken) {
        return null
    }

    const modifiers: string[] = []
    if (event.ctrlKey) modifiers.push('Ctrl')
    if (event.metaKey) modifiers.push('Meta')
    if (event.altKey) modifiers.push('Alt')
    if (event.shiftKey) modifiers.push('Shift')

    return normalizeShortcutBinding([...modifiers, keyToken].join('+'))
}

export function matchesShortcutBinding(
    event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>,
    bindings: ShortcutBinding[],
) {
    const eventBinding = bindingFromKeyboardEvent(event)
    if (!eventBinding) return false
    return bindings.some((binding) => normalizeShortcutBinding(binding) === eventBinding)
}

export function formatShortcutBinding(binding: ShortcutBinding, platform: string = 'web') {
    const normalized = normalizeShortcutBinding(binding)
    if (!normalized) return [binding]

    const tokens = normalized.split('+')
    return tokens.map((token) => {
        if (token === 'Ctrl') return 'Ctrl'
        if (token === 'Meta') return platform === 'darwin' ? 'Cmd' : 'Meta'
        if (token === 'Alt') return platform === 'darwin' ? 'Option' : 'Alt'
        if (token === 'Shift') return 'Shift'
        if (token in keyDisplayLabels) return keyDisplayLabels[token]
        if (/^Key[A-Z]$/.test(token)) return token.slice(3)
        if (/^Digit[0-9]$/.test(token)) return token.slice(5)
        return token
    })
}

export function mergeShortcutSettings(
    base: ShortcutSettings,
    overrides: Partial<Record<ShortcutId, ShortcutBinding[]>>,
) {
    const next = { ...base }

    for (const definition of shortcutDefinitions) {
        const override = overrides[definition.id]
        if (!override) continue

        const deduped = dedupeShortcutBindings(override)
        next[definition.id] = definition.allowMultiple === false ? deduped.slice(0, 1) : deduped
    }

    return next
}
