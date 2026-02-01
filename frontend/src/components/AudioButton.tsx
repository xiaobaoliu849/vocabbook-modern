import { useState, useCallback, useEffect, useRef } from 'react'
import { Volume2 } from 'lucide-react'

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
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const getTextToSpeak = useCallback(() => {
    return text || word || ''
  }, [text, word])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const doPlay = useCallback(async () => {
    const textToSpeak = getTextToSpeak()
    if (!textToSpeak) {
      console.error('No text to speak')
      return
    }

    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
    setIsLoading(true)

    let url: string
    if (useTTS || isExample) {
      url = `http://localhost:8000/api/tts/speak?text=${encodeURIComponent(textToSpeak)}`
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
    audio.oncanplay = () => {
      console.log('Audio can play now')
      setIsLoading(false)
      audio.play().then(() => {
        setIsPlaying(true)
      }).catch((err) => {
        console.error('Play failed:', err)
        setIsPlaying(false)
      })
    }

    audio.onended = () => {
      setIsPlaying(false)
      setIsLoading(false)
      audioRef.current = null
    }

    audio.onerror = (e) => {
      console.error('Audio error:', e)
      setIsPlaying(false)
      setIsLoading(false)
      audioRef.current = null

      // TTS失败时回退到有道
      if ((useTTS || isExample) && word) {
        console.log('Trying fallback...')
        const fallback = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`)
        fallback.play().catch(() => { })
      }
    }

    // 开始加载
    audio.load()
  }, [getTextToSpeak, audioSrc, word, useTTS, isExample])

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
      title={isExample ? "朗读例句" : "播放发音"}
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
