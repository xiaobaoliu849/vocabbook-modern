import { useCallback, useEffect, useRef, useState } from 'react'

interface TypewriterTarget {
    content: string
    reasoning: string
}

export function useChatStreaming() {
    const activeTypingTimerRef = useRef<number | null>(null)
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
    const [streamingContent, setStreamingContent] = useState('')
    const [streamingReasoning, setStreamingReasoning] = useState('')

    const typewriterRef = useRef<{
        targetContent: string
        targetReasoning: string
        getTarget: () => TypewriterTarget
    }>({
        targetContent: '',
        targetReasoning: '',
        getTarget: () => ({ content: '', reasoning: '' }),
    })

    // Clear any running typing timer on unmount.
    useEffect(() => {
        return () => {
            if (activeTypingTimerRef.current !== null) {
                window.clearInterval(activeTypingTimerRef.current)
            }
        }
    }, [])

    const resetStreaming = useCallback((msgId: string | null) => {
        setStreamingMsgId(msgId)
        setStreamingContent('')
        setStreamingReasoning('')
    }, [])

    const startTyping = useCallback((getTarget: () => TypewriterTarget, onTick?: () => void) => {
        if (activeTypingTimerRef.current !== null) {
            window.clearInterval(activeTypingTimerRef.current)
        }

        const tw = typewriterRef.current
        tw.getTarget = getTarget
        const initial = getTarget()
        tw.targetContent = initial.content
        tw.targetReasoning = initial.reasoning

        let typedContent = ''
        let typedReasoning = ''

        const timer = window.setInterval(() => {
            const { content: targetContent, reasoning: targetReasoning } = getTarget()
            tw.targetContent = targetContent
            tw.targetReasoning = targetReasoning

            let hasChanges = false
            if (typedReasoning.length < targetReasoning.length) {
                const diff = targetReasoning.length - typedReasoning.length
                let step = 1
                if (diff > 80) step = Math.floor(Math.random() * 4) + 8
                else if (diff > 40) step = Math.floor(Math.random() * 3) + 5
                else if (diff > 15) step = Math.floor(Math.random() * 2) + 2
                else if (diff > 0) step = 1

                typedReasoning += targetReasoning.substring(typedReasoning.length, typedReasoning.length + step)
                hasChanges = true
            } else if (typedContent.length < targetContent.length) {
                const diff = targetContent.length - typedContent.length
                let step = 1
                if (diff > 80) step = Math.floor(Math.random() * 4) + 8
                else if (diff > 40) step = Math.floor(Math.random() * 3) + 5
                else if (diff > 15) step = Math.floor(Math.random() * 2) + 2
                else if (diff > 0) step = 1

                typedContent += targetContent.substring(typedContent.length, typedContent.length + step)
                hasChanges = true
            }

            if (hasChanges) {
                setStreamingContent(typedContent)
                setStreamingReasoning(typedReasoning)
                onTick?.()
            }
        }, 25)

        activeTypingTimerRef.current = timer
    }, [])

    const stopTyping = useCallback(() => {
        if (activeTypingTimerRef.current !== null) {
            window.clearInterval(activeTypingTimerRef.current)
            activeTypingTimerRef.current = null
        }

        const tw = typewriterRef.current
        const final = tw.getTarget()
        tw.targetContent = final.content
        tw.targetReasoning = final.reasoning

        setStreamingContent(tw.targetContent)
        setStreamingReasoning(tw.targetReasoning)

        return { content: tw.targetContent, reasoning: tw.targetReasoning }
    }, [])

    const cancelTyping = useCallback(() => {
        if (activeTypingTimerRef.current !== null) {
            window.clearInterval(activeTypingTimerRef.current)
            activeTypingTimerRef.current = null
        }
    }, [])

    return {
        streamingMsgId,
        streamingContent,
        streamingReasoning,
        setStreamingMsgId,
        resetStreaming,
        startTyping,
        stopTyping,
        cancelTyping,
    }
}
