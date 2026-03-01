import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, Loader2 } from 'lucide-react'
import { api, API_PATHS } from '../utils/api'

interface ImportResult {
    total: number
    success: number
    failed: number
    skipped: number
    details: Array<{
        word: string
        status: 'success' | 'failed' | 'skipped'
        reason?: string
        meaning?: string
    }>
}

export default function ImportWords() {
    const [activeTab, setActiveTab] = useState<'file' | 'text'>('file')
    const [file, setFile] = useState<File | null>(null)
    const [textInput, setTextInput] = useState('')
    const [tag, setTag] = useState('')
    const [autoLookup, setAutoLookup] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setResult(null)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0])
            setResult(null)
        }
    }

    const handleImport = async () => {
        setIsUploading(true)
        setResult(null)

        try {
            let res: ImportResult

            if (activeTab === 'file') {
                if (!file) return
                const formData = new FormData()
                formData.append('file', file)
                const queryParams = `?auto_lookup=${autoLookup}&tag=${encodeURIComponent(tag)}`
                res = await api.upload(API_PATHS.IMPORT_UPLOAD + queryParams, formData)
            } else {
                if (!textInput.trim()) return
                const words = textInput.split('\n').map(w => w.trim()).filter(w => w)
                res = await api.post(API_PATHS.IMPORT_WORDS, {
                    words,
                    auto_lookup: autoLookup,
                    tag
                })
            }

            setResult(res)
            if (res.success > 0) {
                // Clear inputs on success
                setFile(null)
                setTextInput('')
                if (fileInputRef.current) fileInputRef.current.value = ''
            }
        } catch (error) {
            console.error('Import failed:', error)
            alert('导入失败，请检查网络或文件格式')
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <header>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
                    批量导入
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                    支持 TXT/CSV 文件上传或直接粘贴文本，自动查词并填充释义
                </p>
            </header>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('file')}
                        className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
                            ${activeTab === 'file'
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <Upload size={18} />
                        文件上传
                    </button>
                    <button
                        onClick={() => setActiveTab('text')}
                        className={`flex-1 py-4 text-sm font-medium transition-colors flex items-center justify-center gap-2
                            ${activeTab === 'text'
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        <FileText size={18} />
                        文本粘贴
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Input Area */}
                    {activeTab === 'file' ? (
                        <div
                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                                ${file
                                    ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
                                    : 'border-slate-300 dark:border-slate-600 hover:border-primary-400 dark:hover:border-primary-500'}`}
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".txt,.csv"
                                onChange={handleFileChange}
                            />

                            {file ? (
                                <div className="flex flex-col items-center gap-2">
                                    <FileText size={48} className="text-primary-500" />
                                    <p className="font-medium text-slate-700 dark:text-slate-200">{file.name}</p>
                                    <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                        className="mt-2 text-xs text-red-500 hover:underline"
                                    >
                                        移除文件
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-slate-500">
                                    <Upload size={48} className="mb-2 opacity-50" />
                                    <p className="font-medium">点击或拖拽文件到此处</p>
                                    <p className="text-xs opacity-70">支持 .txt (每行一个单词) 或 .csv (word,meaning)</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <textarea
                            value={textInput}
                            onChange={e => setTextInput(e.target.value)}
                            placeholder="在此粘贴单词列表，每行一个单词..."
                            className="w-full h-48 p-4 rounded-xl border border-slate-200 dark:border-slate-700
                                bg-slate-50 dark:bg-slate-900/50 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                        />
                    )}

                    {/* Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">添加标签 (可选)</label>
                            <input
                                type="text"
                                value={tag}
                                onChange={e => setTag(e.target.value)}
                                placeholder="例如: 四级, 雅思, 2024阅读"
                                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700
                                    bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={autoLookup}
                                    onChange={e => setAutoLookup(e.target.checked)}
                                    className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-slate-700 dark:text-slate-300">自动查词填充释义</span>
                            </label>
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleImport}
                        disabled={isUploading || (activeTab === 'file' ? !file : !textInput.trim())}
                        className="w-full py-3 px-6 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed
                            text-white font-medium shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                正在导入...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={20} />
                                开始导入
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Results */}
            {result && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 animate-fade-in">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">导入结果</h3>

                    <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl text-center">
                            <div className="text-sm text-slate-500">总数</div>
                            <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">{result.total}</div>
                        </div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                            <div className="text-sm text-green-600 dark:text-green-400">成功</div>
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{result.success}</div>
                        </div>
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl text-center">
                            <div className="text-sm text-yellow-600 dark:text-yellow-400">跳过</div>
                            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{result.skipped}</div>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                            <div className="text-sm text-red-600 dark:text-red-400">失败</div>
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{result.failed}</div>
                        </div>
                    </div>

                    {result.details.length > 0 && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2">单词</th>
                                        <th className="px-4 py-2">状态</th>
                                        <th className="px-4 py-2">详情</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {result.details.map((item, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-2 font-medium">{item.word}</td>
                                            <td className="px-4 py-2">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                                                    ${item.status === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                      item.status === 'skipped' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                    {item.status === 'success' ? '成功' : item.status === 'skipped' ? '已存在' : '失败'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-slate-500 dark:text-slate-400 truncate max-w-xs">
                                                {item.meaning || item.reason || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
