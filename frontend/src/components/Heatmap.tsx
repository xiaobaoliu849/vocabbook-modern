import React, { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'
import { api, API_PATHS } from '../utils/api'

interface HeatmapData {
    [date: string]: number
}

interface HeatmapProps {
    className?: string
}

const Heatmap = React.memo(({ className = '' }: HeatmapProps) => {
    const { t, i18n } = useTranslation()
    const [data, setData] = useState<HeatmapData>({})
    const [loading, setLoading] = useState(true)
    const { isDark } = useTheme()
    const locale = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('zh') ? 'zh-CN' : 'en-US'
    const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short' }), [locale])
    const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }), [locale])
    const weekdayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short' }), [locale])

    useEffect(() => {
        fetchHeatmapData()
    }, [])

    const fetchHeatmapData = async () => {
        try {
            const result = await api.get(API_PATHS.STATS_HEATMAP)
            setData(result.heatmap || {})
        } catch (error) {
            console.error('Failed to fetch heatmap data:', error)
        } finally {
            setLoading(false)
        }
    }

    const lightColors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
    const darkColors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
    const colors = isDark ? darkColors : lightColors

    const getColor = (count: number) => {
        if (count === 0) return colors[0]
        if (count <= 3) return colors[1]
        if (count <= 6) return colors[2]
        if (count <= 9) return colors[3]
        return colors[4]
    }

    // Helper to format date as YYYY-MM-DD in local time
    const formatDateLocal = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    // 生成日期和 SVG 数据
    const svgData = useMemo(() => {
        // Normalize today to midnight
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayStr = formatDateLocal(today)

        // Calculate start date (1 year ago, adjusted to Sunday)
        const startDate = new Date(today)
        startDate.setDate(today.getDate() - 364)
        const dayOfWeek = startDate.getDay()
        startDate.setDate(startDate.getDate() - dayOfWeek)

        // Calculate end date (Today)
        const endDate = new Date(today)

        const cells: Array<{
            x: number
            y: number
            dateStr: string
            displayDate: string
            count: number
            isToday: boolean
            isFuture: boolean
        }> = []

        const months: Array<{ text: string; x: number }> = []

        let currentMonth = -1
        let col = 0

        const cellSize = 10
        const cellGap = 2
        const marginLeft = 28
        const marginTop = 15

        // Iterate by day count to avoid accumulation errors (DST safely)
        // Calculate total days to cover
        const msPerDay = 1000 * 60 * 60 * 24
        const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)

        for (let i = 0; i <= totalDays; i++) {
            // Create a fresh date object for each day to ensure accuracy
            const current = new Date(startDate)
            current.setDate(startDate.getDate() + i)

            const dateStr = formatDateLocal(current)
            const dayOfWeekIdx = current.getDay() // 0 = Sunday

            const x = marginLeft + col * (cellSize + cellGap)
            const y = marginTop + dayOfWeekIdx * (cellSize + cellGap)

            const displayDate = dateFormatter.format(current)

            // Simple string comparison for future check
            const isFuture = dateStr > todayStr

            cells.push({
                x,
                y,
                dateStr,
                displayDate,
                count: data[dateStr] || 0,
                isToday: dateStr === todayStr,
                isFuture: isFuture
            })

            // Month labels
            if (dayOfWeekIdx === 0 && current.getMonth() !== currentMonth) {
                currentMonth = current.getMonth()
                months.push({ text: monthFormatter.format(current), x })
            }

            // Move column on Saturday (end of week)
            if (dayOfWeekIdx === 6) {
                col++
            }
        }

        const width = marginLeft + (col + 1) * (cellSize + cellGap)
        const height = marginTop + 7 * (cellSize + cellGap) + 10

        return { cells, months, width, height, cellSize, marginLeft, marginTop }
    }, [data, dateFormatter, monthFormatter]) // Re-run if data or locale changes.
    // colors are handled in render, not in svgData (which contains logical data).

    // Calculate total reviews
    const totalReviews = Object.values(data).reduce((sum, count) => sum + count, 0)
    const activeDays = Object.values(data).filter(count => count > 0).length
    const mondayLabel = weekdayFormatter.format(new Date(2024, 0, 8))
    const wednesdayLabel = weekdayFormatter.format(new Date(2024, 0, 10))
    const fridayLabel = weekdayFormatter.format(new Date(2024, 0, 12))

    // 使用实心背景代替 glass-card，避免 backdrop-filter 导致的 GPU 闪烁问题
    const cardStyle = `bg-white dark:bg-slate-800 rounded-2xl shadow-xl 
                       border border-slate-200 dark:border-slate-700 ${className}`

    if (loading) {
        return (
            <div className={`p-6 ${cardStyle}`}>
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">🔥</span>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('heatmap.title', 'Study heatmap')}</h3>
                </div>
                <div className="flex justify-center items-center h-24">
                    <div className="animate-pulse text-slate-400">{t('heatmap.loading', 'Loading...')}</div>
                </div>
            </div>
        )
    }

    return (
        <div className={`p-6 ${cardStyle}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🔥</span>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{t('heatmap.title', 'Study heatmap')}</h3>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{t('heatmap.pastYear', '(Past year)')}</span>
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                    {t('heatmap.totalReviewsLabel', 'Reviews')} <span className="font-bold text-green-500">{totalReviews}</span>
                    {' · '}
                    {t('heatmap.activeDaysLabel', 'Active days')} <span className="font-bold text-green-500">{activeDays}</span>
                </div>
            </div>

            {/* SVG Heatmap - 纯 SVG 实现，无 React 状态变化，无闪现 */}
            <div className="overflow-x-auto">
                <svg
                    width={svgData.width}
                    height={svgData.height}
                    className="block"
                >
                    {/* Month Labels */}
                    {svgData.months.map((month, i) => (
                        <text
                            key={i}
                            x={month.x}
                            y={10}
                            fontSize="9"
                            fill={isDark ? '#6b7280' : '#9ca3af'}
                        >
                            {month.text}
                        </text>
                    ))}

                    {/* Day Labels */}
                    <text x={0} y={svgData.marginTop + 22} fontSize="9" fill={isDark ? '#6b7280' : '#9ca3af'}>{mondayLabel}</text>
                    <text x={0} y={svgData.marginTop + 46} fontSize="9" fill={isDark ? '#6b7280' : '#9ca3af'}>{wednesdayLabel}</text>
                    <text x={0} y={svgData.marginTop + 70} fontSize="9" fill={isDark ? '#6b7280' : '#9ca3af'}>{fridayLabel}</text>

                    {/* Cells */}
                    {svgData.cells.map((cell) => (
                        !cell.isFuture && (
                            <rect
                                key={cell.dateStr}
                                x={cell.x}
                                y={cell.y}
                                width={svgData.cellSize}
                                height={svgData.cellSize}
                                rx={2}
                                fill={getColor(cell.count)}
                                stroke={cell.isToday ? '#3b82f6' : 'none'}
                                strokeWidth={cell.isToday ? 2 : 0}
                                className="heatmap-svg-cell"
                            >
                                {/* SVG native tooltip - 纯浏览器功能，无 JS */}
                                <title>{cell.displayDate} - {cell.count > 0
                                    ? t('heatmap.reviewCount', '{{count}} reviews', { count: cell.count })
                                    : t('heatmap.noReviews', 'No review records')}</title>
                            </rect>
                        )
                    ))}
                </svg>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-1 mt-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{t('heatmap.less', 'Less')}</span>
                {[0, 1, 4, 7, 10].map((level, i) => (
                    <div
                        key={i}
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: getColor(level) }}
                    />
                ))}
                <span>{t('heatmap.more', 'More')}</span>
            </div>
        </div>
    )
})

export default Heatmap
