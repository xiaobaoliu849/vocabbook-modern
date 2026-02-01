import { useEffect, useRef } from 'react'
import AudioButton from './AudioButton'

interface WordDetailProps {
  word: any;
  onClose: () => void;
}

// 分割例句为数组
function splitExamples(example: string): string[] {
  if (!example) return []
  
  // 按 bullet point 或换行分割
  const parts = example.split(/\n(?=[•\-\*])|\n{2,}/)
  
  return parts
    .map(part => part.trim())
    .filter(part => part.length > 10) // 过滤太短的片段
    .map(part => {
      // 移除 bullet point 符号
      return part.replace(/^[•\-\*]\s*/, '').trim()
    })
}

// 提取纯英文句子（用于TTS）
function extractEnglish(text: string): string {
  // 匹配英文句子（以字母开头，包含标点）
  const sentences = text.match(/[A-Za-z][^\u4e00-\u9fff]*[.!?。]/g) || []
  return sentences[0]?.trim() || text.split('\n')[0]?.trim() || text
}

export default function WordDetailModal({ word, onClose }: WordDetailProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const audioSrc = word.audio || undefined

  // 分割例句
  const examples = word.example ? splitExamples(word.example) : []

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  if (!word) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div ref={modalRef} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-up border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">单词详情</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500">✕</button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Word Title */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-4xl font-bold text-slate-800 dark:text-white flex flex-wrap items-center gap-3">
                {word.word}
                {word.tags && word.tags.split(',').map((tag: string) => tag.trim() && (
                  <span key={tag} className="px-3 py-1 text-sm rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 font-medium">
                    {tag.trim()}
                  </span>
                ))}
              </h2>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xl text-slate-500 font-serif">{word.phonetic}</span>
                <AudioButton 
                  word={word.word} 
                  audioSrc={audioSrc} 
                  autoPlay={true}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600" 
                />
              </div>
            </div>
          </div>

          {/* Roots & Synonyms */}
          {(word.roots || word.synonyms) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {word.roots && (
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-100 dark:border-orange-900/30">
                  <h4 className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-2 uppercase">🌱 词根记忆</h4>
                  <p className="text-orange-900 dark:text-orange-100 text-sm whitespace-pre-line">{word.roots}</p>
                </div>
              )}
              {word.synonyms && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900/30">
                  <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-2 uppercase">🔄 同近义词</h4>
                  <p className="text-indigo-900 dark:text-indigo-100 text-sm whitespace-pre-line">{word.synonyms}</p>
                </div>
              )}
            </div>
          )}

          {/* Meaning */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 dark:text-white">📖 释义</h4>
            <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line text-lg">{word.meaning}</p>
            </div>
          </div>

          {/* Examples - 每句独立播放 */}
          {examples.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                🗣️ 例句
                <span className="text-xs font-normal text-slate-400">({examples.length}句)</span>
              </h4>
              <div className="space-y-3">
                {examples.map((example, index) => {
                  const englishText = extractEnglish(example)
                  return (
                    <div 
                      key={index} 
                      className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <AudioButton 
                          text={englishText}
                          useTTS={true}
                          isExample={true}
                          size={18}
                          className="mt-0.5 flex-shrink-0 bg-emerald-50/50 hover:bg-emerald-100 dark:bg-emerald-900/10"
                        />
                        <div className="flex-1">
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line font-mono text-sm leading-relaxed">
                            {example}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Review Status */}
          {word.next_review_time !== undefined && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm text-slate-500">
              <span>添加时间: {word.date || word.date_added}</span>
              <span>复习次数: {word.review_count || 0}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
