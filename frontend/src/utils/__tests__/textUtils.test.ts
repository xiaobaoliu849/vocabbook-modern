import { describe, it, expect } from 'vitest'
import { splitExamples, extractEnglish } from '../textUtils'

describe('splitExamples', () => {
    it('returns empty array for empty input', () => {
        expect(splitExamples('')).toEqual([])
        expect(splitExamples(null as any)).toEqual([])
    })

    it('splits bullet-pointed examples', () => {
        const input = '• This is example one.\n这是例句一。\n• This is example two.\n这是例句二。'
        const result = splitExamples(input)
        expect(result.length).toBeGreaterThanOrEqual(2)
        expect(result[0]).toContain('example one')
    })

    it('splits double-newline separated examples', () => {
        const input = 'First example sentence.\n第一句。\n\nSecond example sentence.\n第二句。'
        const result = splitExamples(input)
        expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('pairs English and Chinese lines together', () => {
        const input = 'Hello world.\n你好世界。'
        const result = splitExamples(input)
        expect(result).toHaveLength(1)
        expect(result[0]).toContain('Hello world.')
        expect(result[0]).toContain('你好世界。')
    })

    it('filters out very short results', () => {
        const input = 'ab\ncd'
        const result = splitExamples(input)
        // "ab" and "cd" are both < 5 chars
        expect(result).toHaveLength(0)
    })
})

describe('extractEnglish', () => {
    it('extracts English from bilingual text', () => {
        expect(extractEnglish('Hello world.\n你好世界。')).toBe('Hello world.')
    })

    it('removes leading bullet markers', () => {
        expect(extractEnglish('• This is a test.\n这是一个测试。')).toBe('This is a test.')
    })

    it('returns full text if no Chinese present', () => {
        expect(extractEnglish('Just an English sentence.')).toBe('Just an English sentence.')
    })

    it('truncates at first Chinese character', () => {
        expect(extractEnglish('Read this book读书')).toBe('Read this book')
    })

    it('handles empty input', () => {
        expect(extractEnglish('')).toBe('')
    })
})
