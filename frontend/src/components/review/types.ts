// Shared types for review mode components

export type ReviewMode = 'flashcard' | 'spelling' | 'choice' | 'dictation'

export interface ReviewWord {
    id: number
    word: string
    phonetic: string
    meaning: string
    example: string
    easiness: number
    interval: number
}

export interface ReviewModeProps {
    word: ReviewWord
    allWords: ReviewWord[]  // For generating distractors in choice mode
    onComplete: (rating: number) => void
    playAudio: () => void
    isFlipped: boolean
    setIsFlipped: (flipped: boolean) => void
}

/** 单个单词的复习评分记录 */
export interface WordRating {
    word: ReviewWord
    quality: number       // 1-5 评分
    timestamp: number     // 评分时间戳
}

/** 复习会话汇总数据 */
export interface SessionSummaryData {
    ratings: WordRating[]
    duration: number          // 总耗时（秒）
    mode: 'normal' | 'practice' | 'difficult'
    reviewMode: ReviewMode
}
