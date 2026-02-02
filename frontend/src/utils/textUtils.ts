/**
 * 文本处理工具函数
 * 用于处理例句分割和英文提取
 */

/**
 * 分割例句为数组
 * 智能处理: 优先按双换行或明确的打点符号拆分，其次处理单换行的例句+翻译对
 */
export function splitExamples(example: string): string[] {
    if (!example) return []

    // 1. 先按双换行或明确的打点符号分割
    const rawParts = example.split(/\n(?=[•\-\*])|\n{2,}/)

    const results: string[] = []

    for (const part of rawParts) {
        const trimmed = part.trim()
        if (!trimmed) continue

        // 2. 如果这部分包含单换行，且看起来是英文+中文的组合，我们保留在一起
        // 但如果这一部分没有任何打点，但有多行英文，可能需要进一步拆分
        if (!trimmed.match(/^[•\-\*]/) && trimmed.includes('\n')) {
            const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0)

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                // 如果当前行是英文，且下一行包含中文，则它们是一组
                const isEnglish = /^[A-Za-z0-9]/.test(line)
                const nextLineIsChinese = i + 1 < lines.length && /[\u4e00-\u9fff]/.test(lines[i + 1])

                if (isEnglish && nextLineIsChinese) {
                    results.push(line + "\n" + lines[i + 1])
                    i++ // 跳过下一行
                } else {
                    results.push(line)
                }
            }
        } else {
            results.push(trimmed.replace(/^[•\-\*]\s*/, '').trim())
        }
    }

    return results.filter(r => r.length > 5)
}

/**
 * 提取纯英文句子（用于TTS）
 */
export function extractEnglish(text: string): string {
    // 1. 移除首尾空白和打点
    let cleaned = text.trim().replace(/^[•\-\*]\s*/, '')

    // 2. 只有第一行通常是英文 (针对 "句子\n翻译" 格式)
    const firstLine = cleaned.split('\n')[0].trim()

    // 3. 截断到第一个中文字符之前
    const chineseMatch = firstLine.match(/[\u4e00-\u9fff]/)
    if (chineseMatch && chineseMatch.index !== undefined) {
        return firstLine.substring(0, chineseMatch.index).trim()
    }

    return firstLine
}
