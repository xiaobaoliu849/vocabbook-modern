import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

// Mock i18n to avoid initialization issues
vi.mock('../../i18n', () => ({
    default: {
        t: (_key: string, fallback: string) => fallback,
        on: vi.fn(),
        off: vi.fn(),
    },
}))

describe('ErrorBoundary', () => {
    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <div>Test Content</div>
            </ErrorBoundary>
        )
        expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('renders custom fallback when provided', () => {
        const BuggyComponent = () => {
            throw new Error('Test error')
        }

        // Suppress console.error for this test
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

        render(
            <ErrorBoundary fallback={<div>Custom Fallback</div>}>
                <BuggyComponent />
            </ErrorBoundary>
        )

        expect(screen.getByText('Custom Fallback')).toBeInTheDocument()
        spy.mockRestore()
    })
})
