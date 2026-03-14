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
    if (!textToSpeak) {
      console.error('No text to speak')
      return
    }

    // 停止之前的播放
    stopCurrentPlayback()
    setIsPlaying(false)
    setIsLoading(true)

    let url: string
    if (useTTS || isExample) {
      url = `${API_BASE_URL}/api/tts/speak?text=${encodeURIComponent(textToSpeak)}`
    } else if (audioSrc) {
      url = audioSrc
    } else if (word) {
      url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`
    } else {
      setIsLoading(false)
      return
    }

    console.log('Loading audio:', url)
    const audio = new Audio(url)
    audioRef.current = audio

    // 关键修复：使用 canplay 事件
    const handleAudioFailure = () => {
      audioRef.current = null
      if ((useTTS || isExample) && speakWithBrowser(textToSpeak)) {
        return
      }

      // TTS失败时回退到有道（仅单词场景）
      if ((useTTS || isExample) && word) {
        const fallback = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`)
        fallback.onended = () => {
          setIsPlaying(false)
          setIsLoading(false)
        }
        fallback.onerror = () => {
          setIsPlaying(false)
          setIsLoading(false)
        }
        fallback.play().then(() => {
          setIsLoading(false)
          setIsPlaying(true)
        }).catch(() => {
          setIsPlaying(false)
          setIsLoading(false)
        })
        return
      }

      setIsPlaying(false)
      setIsLoading(false)
    }

    audio.oncanplay = () => {
      console.log('Audio can play now')
      setIsLoading(false)
      audio.play().then(() => {
        setIsPlaying(true)
      }).catch((err) => {
        console.error('Play failed:', err)
        handleAudioFailure()
      })
    }

    audio.onended = () => {
      setIsPlaying(false)
      setIsLoading(false)
      audioRef.current = null
    }

    audio.onerror = (e) => {
      console.error('Audio error:', e)
      handleAudioFailure()
    }

    // 开始加载
    audio.load()
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
