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
