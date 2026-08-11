import { API_BASE_URL, getPreferredAccent, getWordAudioUrl, resolveAudioSrc } from './api'
import { audioPool } from './performance'

export { getPreferredAccent, getWordAudioUrl, resolveAudioSrc }

/**
 * Play word pronunciation via the local cached audio API.
 * Reuses the shared AudioPool instead of allocating a new Audio element per call.
 */
export function playWordAudio(word: string, accent?: 'us' | 'uk'): Promise<void> {
    return audioPool.play(getWordAudioUrl(word, accent))
}

/** Best available pronunciation URL for a saved or looked-up word */
export function getPlaybackAudioUrl(word: string, storedAudio?: string): string {
    return resolveAudioSrc(storedAudio) || getWordAudioUrl(word)
}

/** TTS endpoint for example sentences and free text */
export function getTtsUrl(text: string): string {
    return `${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(text)}`
}