import { useState, useCallback, useEffect, useRef } from 'react'
import { Volume2 } from 'lucide-react'
import { API_BASE_URL } from '../utils/api'
import { useTranslation } from 'react-i18next'
import { extractEnglish } from '../utils/textUtils'

interface AudioButtonProps {
  word?: string
  text?: string
  audioSrc?: string
  className?: string
  size?: number
  autoPlay?: boolean
  useTTS?: boolean
  isExample?: boolean
}

export default function AudioButton({
  word,
  text,
  audioSrc,
  className = '',
  size = 20,
  autoPlay = false,
  useTTS = false,
  isExample = false
}: AudioButtonProps) {
  const { t } = useTranslation()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const getTextToSpeak = useCallback(() => {
    const rawText = text || word || ''
    if (!rawText) return ''
    if (isExample) {
      return extractEnglish(rawText)
    }
    return rawText
  }, [isExample, text, word])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      utteranceRef.current = null
    }
  }, [])

  const stopCurrentPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
  }, [])

  const detectSpeechLang = useCallback((value: string) => {
    if (/[\u4e00-\u9fff]/.test(value)) return 'zh-CN'
    if (/[\u3040-\u30ff]/.test(value)) return 'ja-JP'
    if (/[\uac00-\ud7af]/.test(value)) return 'ko-KR'
    if (/[\u0400-\u04ff]/.test(value)) return 'ru-RU'
    return 'en-US'
  }, [])

  const speakWithBrowser = useCallback((value: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
    if (!value.trim()) return false

    try {
      const synth = window.speechSynthesis
      const lang = detectSpeechLang(value)
      const utterance = new SpeechSynthesisUtterance(value)
      utterance.lang = lang

      const voices = synth.getVoices()
      const exactVoice = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase())
      const familyVoice = voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))
      if (exactVoice || familyVoice) {
        utterance.voice = exactVoice || familyVoice || null
      }

      utterance.onstart = () => {
        setIsLoading(false)
        setIsPlaying(true)
      }
      utterance.onend = () => {
        setIsPlaying(false)
        setIsLoading(false)
        utteranceRef.current = null
      }
      utterance.onerror = () => {
        setIsPlaying(false)
        setIsLoading(false)
        utteranceRef.current = null
      }

      utteranceRef.current = utterance
      synth.cancel()
      synth.speak(utterance)
      return true
    } catch (err) {
      console.error('Browser speech failed:', err)
      return false
    }
  }, [detectSpeechLang])

  const doPlay = useCallback(async () => {
    const textToSpeak = getTextToSpeak()
    if (!textToSpeak) return

    stopCurrentPlayback()
    setIsPlaying(false)
    setIsLoading(true)

    // 按优先级构建音频来源列表
    const sources: string[] = []
    if (audioSrc) {
      // 自定义音频源最优先
      sources.push(audioSrc)
    } else if (word) {
      const w = encodeURIComponent(word.trim())
      // Level 1: 有道词典 US 音（最自然）
      sources.push(`https://dict.youdao.com/dictvoice?audio=${w}&type=2`)
      // Level 2: Free Dictionary API 真人录音
      sources.push(`https://api.dictionaryapi.dev/media/pronunciations/en/${encodeURIComponent(word.toLowerCase())}-us.mp3`)
    }
    // Level 3: 本地 Edge-TTS（始终可用，高质量合成）
    sources.push(`${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(textToSpeak)}`)
    // Level 4 (fallback): 浏览器 SpeechSynthesis（见下方）

    const tryPlay = (index: number): void => {
      if (index >= sources.length) {
        // Level 4: 浏览器内置TTS兜底
        if (!speakWithBrowser(textToSpeak)) {
          setIsLoading(false)
          setIsPlaying(false)
        }
        return
      }

      console.log(`[Audio] Trying source ${index + 1}/${sources.length}:`, sources[index])
      const audio = new Audio(sources[index])
      audioRef.current = audio

      audio.oncanplaythrough = () => {
        setIsLoading(false)
        audio.play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            audioRef.current = null
            tryPlay(index + 1)
          })
      }
      audio.onerror = () => {
        audioRef.current = null
        tryPlay(index + 1)
      }
      audio.onended = () => {
        setIsPlaying(false)
        setIsLoading(false)
        audioRef.current = null
      }

      audio.load()
    }

    tryPlay(0)
  }, [getTextToSpeak, audioSrc, word, useTTS, isExample, speakWithBrowser, stopCurrentPlayback])

  // Track previous word/text to detect actual content changes
  const prevTextRef = useRef<string>('')
  const isMountedRef = useRef(false)

  useEffect(() => {
    const textToSpeak = getTextToSpeak()

    // Only autoPlay when:
    // 1. autoPlay is enabled
    // 2. We have actual content (not empty)
    // 3. Either: it's first mount with valid content, OR content has changed
    if (autoPlay && textToSpeak && textToSpeak.trim().length > 0) {
      const shouldPlay = !isMountedRef.current || prevTextRef.current !== textToSpeak

      if (shouldPlay) {
        isMountedRef.current = true
        prevTextRef.current = textToSpeak
        const timer = setTimeout(() => doPlay(), 300)
        return () => clearTimeout(timer)
      }
    }

    // Mark as mounted but don't play if there's no valid text
    isMountedRef.current = true
  }, [autoPlay, getTextToSpeak, doPlay])

  const playAudio = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying || isLoading) return
    doPlay()
  }, [doPlay, isPlaying, isLoading])

  return (
    <button
      onClick={playAudio}
      className={`p-2 rounded-lg transition-all duration-300 relative group ${isPlaying
        ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
        : isExample
          ? 'hover:bg-emerald-100 text-emerald-500 hover:text-emerald-600 dark:hover:bg-emerald-900/20 dark:text-emerald-400'
          : 'hover:bg-slate-100 text-slate-500 hover:text-primary-600 dark:hover:bg-slate-800 dark:text-slate-400'
        } ${className}`}
      title={isExample
        ? t('audio.readExample', 'Read example aloud')
        : t('audio.playPronunciation', 'Play pronunciation')}
      disabled={isPlaying || isLoading}
    >
      <Volume2
        size={size}
        className={`transition-transform duration-300 ${isPlaying ? 'scale-110 animate-pulse' : 'group-hover:scale-110'
          }`}
      />

      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </span>
      )}

      {isPlaying && (
        <span className="absolute inset-0 rounded-lg animate-ping bg-primary-400/20 pointer-times-none" />
      )}
    </button>
  )
}
