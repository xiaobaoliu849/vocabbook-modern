import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
}

// 检查是否为开发环境
const isDev = import.meta.env.DEV


/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，防止整个应用崩溃
 */
export class ErrorBoundary extends Component<Props, State> {
    private handleLanguageChanged = () => {
        this.forceUpdate()
    }

    constructor(props: Props) {
        super(props)
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        }
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo)
        this.setState({ errorInfo })
    }

    componentDidMount() {
        i18n.on('languageChanged', this.handleLanguageChanged)
    }

    componentWillUnmount() {
        i18n.off('languageChanged', this.handleLanguageChanged)
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null })
    }

    render() {
        const t = i18n.t.bind(i18n)

        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }

            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
                    <div className="glass-card p-8 max-w-md w-full text-center space-y-6">
                        <div className="text-6xl">😵</div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                            {t('errorBoundary.title', 'Oops, something went wrong!')}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            {t('errorBoundary.description', 'The app encountered an unexpected error. Please try refreshing the page.')}
                        </p>

                        {isDev && this.state.error && (
                            <div className="text-left bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                                <p className="text-sm font-mono text-red-700 dark:text-red-400 break-all">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <details className="mt-2">
                                        <summary className="text-sm text-red-600 dark:text-red-500 cursor-pointer">
                                            {t('errorBoundary.stackDetails', 'View stack details')}
                                        </summary>
                                        <pre className="mt-2 text-xs overflow-auto max-h-40 text-red-600 dark:text-red-400">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleRetry}
                                className="btn-primary"
                            >
                                {t('errorBoundary.retry', 'Retry')}
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="btn-secondary"
                            >
                                {t('errorBoundary.refresh', 'Refresh page')}
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
