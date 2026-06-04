import { type ReactNode } from 'react'

interface PageTitleProps {
    children: ReactNode
    icon?: ReactNode
    subtitle?: string
    actions?: ReactNode
}

export function PageTitle({ children, icon, subtitle, actions }: PageTitleProps) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    {icon}
                    {children}
                </h2>
                {subtitle && (
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{subtitle}</p>
                )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    )
}
