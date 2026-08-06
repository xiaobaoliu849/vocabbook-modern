/**
 * Centralized AI Model defaults, presets, and resolution utilities.
 */

export const DEFAULT_MODELS: Record<string, string> = {
    dashscope: 'qwen3.7-flash',
    openai: 'gpt-5.6-luna',
    anthropic: 'claude-5-sonnet',
    gemini: 'gemini-3.6-flash',
    ollama: 'qwen3.5:9b',
    custom: '',
}

export function getDefaultModel(provider: string): string {
    const key = (provider || '').toLowerCase()
    return DEFAULT_MODELS[key] || 'qwen3.7-flash'
}

export interface ModelOption {
    id: string
    name: string
    tag?: string
}

export const PROVIDER_MODEL_PRESETS: Record<string, ModelOption[]> = {
    dashscope: [
        { id: 'qwen3.7-flash', name: 'qwen3.7-flash', tag: '最新推荐' },
        { id: 'qwen3.7-max', name: 'qwen3.7-max (旗舰推理)' },
        { id: 'qwen3.5-flash', name: 'qwen3.5-flash' },
        { id: 'qwen-plus', name: 'qwen-plus' },
        { id: 'qwen-max', name: 'qwen-max' },
    ],
    openai: [
        { id: 'gpt-5.6-luna', name: 'gpt-5.6-luna', tag: '最新推荐' },
        { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol (旗舰)' },
        { id: 'gpt-5.6-terra', name: 'gpt-5.6-terra (平衡)' },
        { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
        { id: 'o3-mini', name: 'o3-mini' },
    ],
    anthropic: [
        { id: 'claude-5-sonnet', name: 'claude-5-sonnet', tag: '最新推荐' },
        { id: 'claude-4.5-sonnet', name: 'claude-4.5-sonnet' },
        { id: 'claude-3-7-sonnet', name: 'claude-3-7-sonnet' },
    ],
    gemini: [
        { id: 'gemini-3.6-flash', name: 'gemini-3.6-flash', tag: '最新推荐' },
        { id: 'gemini-3.5-pro', name: 'gemini-3.5-pro' },
        { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' },
    ],
}

/**
 * Gets the configured active AI model for the specified provider or current default provider.
 */
export function getActiveAiModel(provider?: string): string {
    const activeProvider = provider || localStorage.getItem('ai_provider') || 'dashscope'
    let modelsMap: Record<string, string> = {}
    try {
        modelsMap = JSON.parse(localStorage.getItem('ai_models_map') || '{}')
    } catch {
        modelsMap = {}
    }

    let savedModel = modelsMap[activeProvider] || localStorage.getItem('ai_model')

    // Auto-migrate legacy qwen-flash/qwen-plus to qwen3.7-flash if needed
    if (activeProvider === 'dashscope' && (!savedModel || savedModel === 'qwen-flash' || savedModel === 'qwen-plus' || savedModel === 'qwen3.5-flash' || savedModel === 'qwen-flash-latest') && !localStorage.getItem('qwen37_flash_migrated_v3')) {
        savedModel = 'qwen3.7-flash'
        modelsMap[activeProvider] = savedModel
        localStorage.setItem('qwen37_flash_migrated_v3', 'true')
        localStorage.setItem('ai_models_map', JSON.stringify(modelsMap))
        localStorage.setItem('ai_model', savedModel)
    }

    if (savedModel && savedModel.trim()) {
        return savedModel.trim()
    }

    return getDefaultModel(activeProvider)
}
