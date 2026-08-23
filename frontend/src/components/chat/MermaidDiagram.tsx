import React, { useEffect, useState } from 'react'

export const sanitizeMermaidCode = (code: string): string => {
    if (!code) return code

    // Process line by line to wrap node labels in double quotes.
    // Mermaid's parser chokes on special characters like ( ) { } [ ] "
    // inside unquoted node labels. Wrapping in "..." makes them safe.
    return code.split('\n').map(line => {
        const trimmed = line.trim()

        // Skip empty lines and directive/declaration lines
        if (!trimmed ||
            trimmed.startsWith('style ') ||
            trimmed.startsWith('classDef ') ||
            trimmed.startsWith('class ') ||
            trimmed.startsWith('%%') ||
            trimmed.startsWith('subgraph ') ||
            trimmed === 'end' ||
            /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|mindmap)\b/.test(trimmed)) {
            return line
        }

        let result = line

        // 1. Wrap content inside [...] node labels in double quotes
        //    A[text with (parens)] → A["text with (parens)"]
        result = result.replace(/(\b[A-Za-z]\w*)\[([^\]]+)\]/g, (_m, id, content) => {
            if (content.startsWith('"') && content.endsWith('"')) return _m
            return `${id}["${content.replace(/"/g, "'")}"]`
        })

        // 2. Wrap content inside {...} diamond nodes in double quotes
        //    B{question?} → B{"question?"}
        result = result.replace(/(\b[A-Za-z]\w*)\{([^}]+)\}/g, (_m, id, content) => {
            if (content.startsWith('"') && content.endsWith('"')) return _m
            return `${id}{"${content.replace(/"/g, "'")}"}`
        })

        // 3. Wrap content inside (...) rounded rect nodes in double quotes
        //    C(text) → C("text")
        //    Skip known Mermaid directives that use parens
        result = result.replace(/(\b[A-Za-z]\w*)\(([^)]+)\)/g, (_m, id, content) => {
            if (content.startsWith('"') && content.endsWith('"')) return _m
            if (['fill', 'stroke', 'style', 'click', 'class', 'classDef', 'linkStyle'].includes(id)) return _m
            return `${id}("${content.replace(/"/g, "'")}")`
        })

        // 4. Sanitize link labels: -->|text| — convert " to ' inside
        result = result.replace(/(-->\|)([^|]+)(\|)/g, (_m, open, content, close) => {
            return `${open}${content.replace(/"/g, "'")}${close}`
        })

        return result
    }).join('\n')
}

export const MermaidDiagram: React.FC<{ chartCode: string }> = ({ chartCode }) => {
    const [svg, setSvg] = useState<string>('')
    const [error, setError] = useState<string | null>(null)
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'))
        })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        let isMounted = true
        const renderId = `mermaid-${Math.random().toString(36).substring(2, 9)}`

        const renderChart = async () => {
            try {
                const { default: mermaid } = await import('mermaid')
                if (!isMounted) return

                // Initialize mermaid with correct theme (dark / default).
                // Chrome colors read the live palette CSS variables so diagrams
                // follow the active theme (cream/peach/stone × light/dark);
                // amber accents stay fixed like the rest of the accent scale.
                const cssVar = (name: string) =>
                    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
                mermaid.initialize({
                    startOnLoad: false,
                    theme: isDark ? 'dark' : 'default',
                    themeVariables: isDark ? {
                        background: cssVar('--warm-800'),
                        primaryColor: '#f59e0b', // amber-500
                        primaryTextColor: cssVar('--warm-50'),
                        lineColor: cssVar('--warm-500'),
                    } : {
                        background: cssVar('--warm-50'),
                        primaryColor: '#d97706', // amber-600
                        primaryTextColor: cssVar('--warm-900'),
                        lineColor: cssVar('--warm-300'),
                    },
                    // 'loose' allowed HTML in labels to reach foreignObject,
                    // so injected markup in model-generated labels executed
                    // on render (renderer XSS). 'strict' runs mermaid's
                    // built-in sanitizer instead.
                    securityLevel: 'strict',
                })

                const cleanCode = sanitizeMermaidCode(chartCode.trim())
                if (!cleanCode) return

                setError(null)
                const { svg: renderedSvg } = await mermaid.render(renderId, cleanCode)

                if (isMounted) {
                    setSvg(renderedSvg)
                }
            } catch (err: any) {
                console.error("Mermaid parsing error:", err)
                const badElement = document.getElementById(renderId)
                if (badElement) {
                    badElement.remove()
                }

                if (isMounted) {
                    setError(err?.message || "Failed to parse Mermaid diagram")
                }
            }
        }

        renderChart()

        return () => {
            isMounted = false
        }
    }, [chartCode, isDark])

    if (error) {
        return (
            <div className="my-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-mono text-red-600 dark:text-red-400">
                <div className="font-bold mb-2">⚠️ Diagram Render Error:</div>
                <pre className="overflow-x-auto whitespace-pre-wrap">{chartCode}</pre>
                <div className="mt-2 text-[10px] text-warm-500">{error}</div>
            </div>
        )
    }

    if (!svg) {
        return (
            <div className="my-3 flex items-center justify-center p-8 border border-warm-200 dark:border-warm-800 rounded-xl bg-warm-50/50 dark:bg-warm-900/30">
                <div className="animate-pulse flex items-center gap-2 text-sm text-warm-400 dark:text-warm-500">
                    <span className="h-4 w-4 rounded-full border-2 border-warm-400 dark:border-warm-500 border-t-transparent animate-spin"></span>
                    Rendering Diagram...
                </div>
            </div>
        )
    }

    return (
        <div
            className="my-3 p-4 flex justify-center overflow-x-auto border border-warm-200 dark:border-warm-800 rounded-xl bg-warm-50/50 dark:bg-warm-900/30 shadow-sm"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    )
}
