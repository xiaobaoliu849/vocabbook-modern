import { API_BASE_URL, getPreferredAccent, getWordAudioUrl, resolveAudioSrc } from './api'

export { getPreferredAccent, getWordAudioUrl, resolveAudioSrc }

/** Play word pronunciation via the local cached audio API */
export function playWordAudio(word: string, accent?: 'us' | 'uk'): Promise<void> {
    const url = getWordAudioUrl(word, accent)
    const audio = new Audio(url)
    return audio.play().catch(err => {
        console.warn('Word audio play failed:', err)
        throw err
    })
}

/** Best available pronunciation URL for a saved or looked-up word */
export function getPlaybackAudioUrl(word: string, storedAudio?: string): string {
    return resolveAudioSrc(storedAudio) || getWordAudioUrl(word)
}

/** TTS endpoint for example sentences and free text */
export function getTtsUrl(text: string): string {
    return `${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(text)}`
}