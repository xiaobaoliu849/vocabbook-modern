import { useEffect, useRef, useState } from 'react'
import AudioButton from './AudioButton'
import { X, BookOpen, MessageSquare, RefreshCw, Sprout, StickyNote } from 'lucide-react'
import { api, API_PATHS } from '../utils/api'
import { useShortcuts } from '../context/ShortcutContext'
import { useTranslation } from 'react-i18next'
import { splitExamples, extractEnglish } from '../utils/textUtils'
 
interface WordDetailProps {
  word: any;
  onClose: () => void;
  onWordUpdated?: () => void;
}

export default function WordDetailModal({ word, onClose, onWordUpdated }: WordDetailProps) {
   const { t } = useTranslation()
   const { matches } = useShortcuts()
   const modalRef = useRef<HTMLDivElement>(null)
   const audioSrc = word.audio || undefined
   
   const [note, setNote] = useState(word.note || '')
   const [isSavingNote, setIsSavingNote] = useState(false)
 
   const examples = word.example ? splitExamples(word.example) : []
 
   useEffect(() => {
     const handleClickOutside = (event: MouseEvent) => {
       const target = event.target as Element | null
       if (target?.closest('[data-selection-overlay="true"]')) {
         return
       }
       if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
         onClose()
       }
     }
     document.addEventListener('mousedown', handleClickOutside)
     return () => document.removeEventListener('mousedown', handleClickOutside)
   }, [onClose])
 
   useEffect(() => {
     const handleEsc = (event: KeyboardEvent) => {
       if (matches(event, 'common.closeDialog')) onClose()
     }
     document.addEventListener('keydown', handleEsc)
     return () => document.removeEventListener('keydown', handleEsc)
   }, [matches, onClose])
 
   useEffect(() => {
     if (word && word.word) {
       const timer = setTimeout(() => {
         const url = audioSrc || `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.word)}&type=2`
         const audio = new Audio(url)
         audio.play().catch(err => console.warn('Auto-play failed:', err))
       }, 300)
       return () => clearTimeout(timer)
     }
   }, [word, audioSrc])
 
   const handleSaveNote = async () => {
    if (note === word.note) return

     setIsSavingNote(true)
     try {
       await api.put(API_PATHS.WORD(word.word), { note })
       onWordUpdated?.()
     } catch (err) {
       console.error('Failed to save note:', err)
     } finally {
       setIsSavingNote(false)
     }
   }
 
   if (!word) return null
 
   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
       <div ref={modalRef} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-up border border-slate-200 dark:border-slate-700">
         {/* Header */}
         <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-700">
	          <h3 className="text-lg font-medium text-slate-500 dark:text-slate-400">{t('wordDetail.title', 'Word details')}</h3>
           <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-400 hover:text-slate-600 hover:rotate-90">
             <X size={20} />
           </button>
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
                   <h4 className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-2 uppercase flex items-center gap-2">
                     <Sprout size={14} />
	                    {t('wordDetail.roots', 'Roots & memory')}
                   </h4>
                   <p className="text-orange-900 dark:text-orange-100 text-sm whitespace-pre-line">{word.roots}</p>
                 </div>
               )}
               {word.synonyms && (
                 <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900/30">
                   <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-2 uppercase flex items-center gap-2">
                     <RefreshCw size={14} />
	                    {t('wordDetail.synonyms', 'Synonyms')}
                   </h4>
                   <p className="text-indigo-900 dark:text-indigo-100 text-sm whitespace-pre-line">{word.synonyms}</p>
                 </div>
               )}
             </div>
           )}
 
           {/* Meaning */}
           <div className="space-y-2">
             <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
               <BookOpen size={18} className="text-primary-500" />
	              {t('wordDetail.meaning', 'Meaning')}
             </h4>
             <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
               <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line text-lg">{word.meaning}</p>
             </div>
           </div>
 
           {/* Examples */}
           {examples.length > 0 && (
             <div className="space-y-3">
               <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                 <MessageSquare size={18} className="text-emerald-500" />
	                {t('wordDetail.examples', 'Examples')}
	                <span className="text-xs font-normal text-slate-400">({t('wordDetail.exampleCount', '{{count}} examples', { count: examples.length })})</span>
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
 
           {/* Personal Note */}
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <StickyNote size={18} className="text-amber-500" />
	                 {t('wordDetail.notes', 'Personal notes')}
                </div>
                {isSavingNote && (
                  <span className="text-xs text-slate-400 animate-pulse">
	                   {t('wordDetail.saving', 'Saving...')}
                  </span>
                )}
               </h4>
             </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={handleSaveNote}
	             placeholder={t('wordDetail.notePlaceholder', 'Add your mnemonics, associations, or reflections... (auto-saved)')}
              className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900/30 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700 resize-none min-h-[100px] transition-all"
            />
           </div>
 
           {/* Review Status */}
           {word.next_review_time !== undefined && (
             <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm text-slate-500">
	              <span>{t('wordDetail.addedAt', 'Added: {{date}}', { date: word.date || word.date_added })}</span>
	              <span>{t('wordDetail.reviewCount', 'Reviews: {{count}}', { count: word.review_count || 0 })}</span>
             </div>
           )}
         </div>
       </div>
     </div>
   )
 }
