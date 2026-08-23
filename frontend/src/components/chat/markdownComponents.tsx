import React from 'react'
import { MermaidDiagram } from './MermaidDiagram'

export const renderChildrenWithCaret = (children: React.ReactNode, isStreaming: boolean): React.ReactNode => {
    if (!isStreaming) return children

    const processNode = (node: React.ReactNode): { processed: React.ReactNode, found: boolean } => {
        if (typeof node === 'string') {
            if (node.endsWith('▋')) {
                const textWithoutCaret = node.slice(0, -1)
                return {
                    processed: (
                        <>
                            {textWithoutCaret}
                            <span className="inline-block w-1.5 h-[1.1em] ml-1 bg-amber-500 dark:bg-amber-400 animate-pulse align-middle rounded-sm shadow-[0_0_8px_#f59e0b] dark:shadow-[0_0_8px_#fbbf24]" />
                        </>
                    ),
                    found: true
                }
            }
            return { processed: node, found: false }
        }

        if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
            const childrenArray = React.Children.toArray(node.props.children)
            if (childrenArray.length > 0) {
                for (let i = childrenArray.length - 1; i >= 0; i--) {
                    const { processed, found } = processNode(childrenArray[i])
                    if (found) {
                        const newChildren = [...childrenArray]
                        const replacement = processed === undefined || processed === null || typeof processed === 'boolean'
                            ? <></>
                            : processed
                        newChildren[i] = replacement as (typeof newChildren)[number]
                        return {
                            processed: React.cloneElement(node, undefined, ...newChildren),
                            found: true
                        }
                    }
                }
            }
        }

        return { processed: node, found: false }
    }

    const { processed } = processNode(children)
    return processed
}

export const createMarkdownComponents = (isStreaming: boolean, isUser: boolean = false) => ({
    p: ({ children }: any) => (
        <p className={`mb-3 last:mb-0 leading-[1.6] ${isUser ? '' : 'text-warm-800 dark:text-warm-200'}`}>
            {renderChildrenWithCaret(children, isStreaming)}
        </p>
    ),
    ul: ({ children }: any) => (
        <ul className={`list-disc pl-5 mb-3 space-y-1 ${isUser ? '' : 'text-warm-800 dark:text-warm-200'}`}>
            {children}
        </ul>
    ),
    ol: ({ children }: any) => (
        <ol className={`list-decimal pl-5 mb-3 space-y-1 ${isUser ? '' : 'text-warm-800 dark:text-warm-200'}`}>
            {children}
        </ol>
    ),
    li: ({ children }: any) => (
        <li className={isUser ? '' : 'text-warm-800 dark:text-warm-200'}>
            {renderChildrenWithCaret(children, isStreaming)}
        </li>
    ),
    h1: ({ children }: any) => (
        <h1 className={`text-xl font-bold mt-4 mb-2 ${isUser ? '' : 'text-warm-900 dark:text-white'}`}>
            {renderChildrenWithCaret(children, isStreaming)}
        </h1>
    ),
    h2: ({ children }: any) => (
        <h2 className={`text-lg font-bold mt-3 mb-2 ${isUser ? '' : 'text-warm-900 dark:text-white'}`}>
            {renderChildrenWithCaret(children, isStreaming)}
        </h2>
    ),
    h3: ({ children }: any) => (
        <h3 className={`text-base font-bold mt-2 mb-1 ${isUser ? '' : 'text-warm-900 dark:text-white'}`}>
            {renderChildrenWithCaret(children, isStreaming)}
        </h3>
    ),
    blockquote: ({ children }: any) => (
        <blockquote className={`border-l-4 border-amber-500/80 pl-4 italic my-3 ${isUser ? '' : 'text-warm-600 dark:text-warm-400'}`}>
            {children}
        </blockquote>
    ),
    hr: () => (
        <hr className="my-4 border-t border-warm-200 dark:border-warm-800" />
    ),
    a: ({ href, children }: any) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-medium inline-flex items-center gap-0.5 hover:underline ${isUser ? 'text-amber-300 dark:text-amber-600' : 'text-amber-600 dark:text-amber-400'}`}
        >
            {renderChildrenWithCaret(children, isStreaming)}
        </a>
    ),
    pre: ({ children }: any) => {
        const isMermaid = children && children.props && children.props.className === 'language-mermaid';
        if (isMermaid) {
            return <>{children}</>;
        }
        return (
            <pre className="bg-warm-950/80 dark:bg-warm-900/80 rounded-xl p-4 my-3 overflow-x-auto border border-warm-800 dark:border-warm-700/50 custom-scrollbar">
                {children}
            </pre>
        );
    },
    code: ({ className, children, ...props }: any) => {
        const isInline = !className
        const processedChildren = renderChildrenWithCaret(children, isStreaming)
        if (!isInline && className === 'language-mermaid') {
            const chartCode = String(children).replace(/▋$/, '').trim();
            if (isStreaming) {
                return (
                    <div className="my-3 rounded-xl border border-warm-200/50 dark:border-warm-800/50 bg-warm-950/90 dark:bg-warm-900/90 p-4">
                        <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-2 font-mono flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                            Streaming Diagram Code...
                        </div>
                        <pre className="text-xs text-warm-300 font-mono overflow-x-auto whitespace-pre-wrap">{chartCode}</pre>
                    </div>
                )
            }
            return <MermaidDiagram chartCode={chartCode} />
        }
        return isInline ? (
            <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-warm-100 dark:bg-warm-800 text-amber-600 dark:text-amber-400 font-semibold" {...props}>
                {processedChildren}
            </code>
        ) : (
            <code className={`${className || ''} font-mono text-xs text-warm-200 block`} {...props}>
                {processedChildren}
            </code>
        )
    },
    table: ({ children }: any) => (
        <div className={`overflow-x-auto my-3 border rounded-xl shadow-sm ${isUser ? 'border-white/20' : 'border-warm-200 dark:border-warm-700/60'}`}>
            <table className="w-full border-collapse text-sm">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }: any) => (
        <thead className={isUser ? 'bg-white/10' : 'bg-warm-100/80 dark:bg-warm-800/50'}>
            {children}
        </thead>
    ),
    tr: ({ children }: any) => (
        <tr className={`transition-colors ${isUser ? 'even:bg-white/5 hover:bg-white/10' : 'even:bg-warm-50/50 dark:even:bg-warm-800/20 hover:bg-warm-50 dark:hover:bg-warm-800/35'}`}>
            {children}
        </tr>
    ),
    th: ({ children }: any) => (
        <th className={`border-b p-2.5 text-left font-bold ${isUser ? 'border-white/20 text-white dark:text-warm-900' : 'border-warm-200 dark:border-warm-700/60 text-warm-900 dark:text-white'}`}>
            {renderChildrenWithCaret(children, isStreaming)}
        </th>
    ),
    td: ({ children }: any) => (
        <td className={`border-b p-2.5 text-left ${isUser ? 'border-white/10' : 'border-warm-200/50 dark:border-warm-700/30'}`}>
            {renderChildrenWithCaret(children, isStreaming)}
        </td>
    )
})
