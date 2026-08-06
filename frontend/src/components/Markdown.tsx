import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownProps {
    children: string
    /** 自定义元素渲染组件（透传给 react-markdown） */
    components?: Components
    /** 启用 GFM 扩展（表格/删除线/任务列表等），默认关闭 */
    gfm?: boolean
}

// 模块级常量保证插件数组引用稳定，避免 react-markdown 每次渲染重建 unified processor
const GFM_PLUGINS = [remarkGfm]

/**
 * 懒加载 Markdown 渲染组件。
 * 调用方用 React.lazy(() => import('./Markdown')) 引入，
 * 把 react-markdown / remark-gfm 独立成 chunk，不进主 bundle。
 */
export default function Markdown({ children, components, gfm = false }: MarkdownProps) {
    return gfm ? (
        <ReactMarkdown remarkPlugins={GFM_PLUGINS} components={components}>
            {children}
        </ReactMarkdown>
    ) : (
        <ReactMarkdown components={components}>
            {children}
        </ReactMarkdown>
    )
}
