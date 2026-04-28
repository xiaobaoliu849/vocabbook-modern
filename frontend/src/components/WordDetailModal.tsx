import { useEffect, useRef, useState } from 'react'
import AudioButton from './AudioButton'
import { X, Check, GripHorizontal } from 'lucide-react'
import { api, API_PATHS } from '../utils/api'
import { useShortcuts } from '../context/ShortcutContext'
import { useTranslation } from 'react-i18next'
import { splitExamples, extractEnglish } from '../utils/textUtils'
 
interface WordDetailProps {
  word: any;
  onClose: () => void;
  onWordUpdated?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

// Section Header Component for consistent, impeccable typography
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-[11px] font-bold text-blue-500/80 dark:text-blue-400 uppercase tracking-[0.2em] mb-4">
    {children}
  </h4>
);

export default function WordDetailModal({ word, onClose, onWordUpdated, onPrevious, onNext }: WordDetailProps) {
   const { t } = useTranslation()
   const { matches } = useShortcuts()
   const modalRef = useRef<HTMLDivElement>(null)
   const audioSrc = word.audio || undefined
   
   const [note, setNote] = useState(word.note || '')
   const [isSavingNote, setIsSavingNote] = useState(false)
   const [savedSuccess, setSavedSuccess] = useState(false)
 
   // Drag state
   const [position, setPosition] = useState({ x: 0, y: 0 })
   const [isDragging, setIsDragging] = useState(false)
   const dragStart = useRef({ x: 0, y: 0 })
   const dragBounds = useRef({ minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity })

   const examples = word.example ? splitExamples(word.example) : []
 
   // Reset note state when word changes (e.g. during next/prev navigation)
   useEffect(() => {
     setNote(word.note || '')
     setSavedSuccess(false)
     // Reset position when opening a new word? Optional, let's keep it where they dragged it for better UX.
   }, [word])

   // Click outside handler
   useEffect(() => {
     const handleClickOutside = (event: MouseEvent) => {
       if (isDragging) return // Don't close if we are dragging
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
   }, [onClose, isDragging])
 
   // Keyboard shortcuts
   useEffect(() => {
     const handleKeyDown = (event: KeyboardEvent) => {
       const target = event.target as HTMLElement
       const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

       if (matches(event, 'common.closeDialog')) {
           onClose()
           return
       }
       
       if (!isInput) {
           if (event.key === 'ArrowLeft' && onPrevious) {
               event.preventDefault()
               event.stopPropagation()
               onPrevious()
           } else if (event.key === 'ArrowRight' && onNext) {
               event.preventDefault()
               event.stopPropagation()
               onNext()
           }
       }
     }
     document.addEventListener('keydown', handleKeyDown)
     return () => document.removeEventListener('keydown', handleKeyDown)
   }, [matches, onClose, onPrevious, onNext])
 
   // Audio auto-play
   useEffect(() => {
     if (word && word.word) {
       const timer = setTimeout(() => {
         const url = audioSrc || `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.word.trim())}&type=2`
         const audio = new Audio(url)
         audio.play().catch(err => console.warn('Auto-play failed:', err))
       }, 300)
       return () => clearTimeout(timer)
     }
   }, [word, audioSrc])
 
   // Dragging logic
   useEffect(() => {
     const handleMouseMove = (e: MouseEvent) => {
       if (!isDragging) return
       
       let newX = e.clientX - dragStart.current.x
       let newY = e.clientY - dragStart.current.y
       
       // Apply constraints so it doesn't go off screen completely
       newX = Math.max(dragBounds.current.minX, Math.min(newX, dragBounds.current.maxX))
       newY = Math.max(dragBounds.current.minY, Math.min(newY, dragBounds.current.maxY))
       
       setPosition({ x: newX, y: newY })
     }
     const handleMouseUp = () => {
       setIsDragging(false)
     }
     
     if (isDragging) {
       document.addEventListener('mousemove', handleMouseMove)
       document.addEventListener('mouseup', handleMouseUp)
     }
     return () => {
       document.removeEventListener('mousemove', handleMouseMove)
       document.removeEventListener('mouseup', handleMouseUp)
     }
   }, [isDragging])

   const handleMouseDown = (e: React.MouseEvent) => {
     if (!modalRef.current) return
     setIsDragging(true)
     
     dragStart.current = {
       x: e.clientX - position.x,
       y: e.clientY - position.y
     }
     
     // Calculate boundaries dynamically on drag start based on current window size
     const rect = modalRef.current.getBoundingClientRect()
     // Base absolute position if transform was translate(0,0)
     const baseTop = rect.top - position.y
     const baseLeft = rect.left - position.x
     
     dragBounds.current = {
       minY: -baseTop, // Top edge cannot go above viewport (y=0)
       maxY: window.innerHeight - 60 - baseTop, // Leave at least 60px visible at the bottom
       minX: 100 - rect.width - baseLeft, // Leave at least 100px visible on the left
       maxX: window.innerWidth - 100 - baseLeft // Leave at least 100px visible on the right
     }
   }

   const handleSaveNote = async () => {
    if (note === word.note) return

     setIsSavingNote(true)
     setSavedSuccess(false)
     try {
       await api.put(API_PATHS.WORD(word.word), { note })
       onWordUpdated?.()
       setSavedSuccess(true)
       setTimeout(() => setSavedSuccess(false), 2000)
     } catch (err) {
       console.error('Failed to save note:', err)
     } finally {
       setIsSavingNote(false)
     }
   }
 
   if (!word) return null
 
   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-fade-in transition-all">
       <div 
         ref={modalRef} 
         className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-blue-900/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-up ring-1 ring-slate-100 dark:ring-white/10"
         style={{ 
           transform: `translate(${position.x}px, ${position.y}px)`,
           transition: isDragging ? 'none' : 'transform 0.1s ease-out'
         }}
       >
         {/* Minimalist Header without harsh borders - Now Draggable */}
         <div 
           className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md cursor-grab active:cursor-grabbing group select-none"
           onMouseDown={handleMouseDown}
         >
           <div className="flex items-center gap-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-colors">
             <GripHorizontal size={18} className="opacity-50" />
             {word.next_review_time !== undefined && (
               <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tracking-wider uppercase">
                 {t('wordDetail.reviewCount', 'Reviews: {{count}}', { count: word.review_count || 0 })}
               </span>
             )}
           </div>
           <button 
             onClick={(e) => {
               e.stopPropagation()
               onClose()
             }} 
             className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
           >
             <X size={20} strokeWidth={2} />
           </button>
         </div>
 
         <div className="px-10 pb-12 pt-2 space-y-12">
           {/* Word Title & Phonetic - Bold, clean sans-serif for a modern, airy feel */}
           <div>
             <div className="flex flex-wrap items-center gap-4 mb-3">
               <h2 className="text-5xl font-extrabold text-slate-800 dark:text-slate-50 tracking-tight">
                 {word.word}
               </h2>
               {word.tags && word.tags.split(',').map((tag: string) => tag.trim() && (
                 <span key={tag} className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 text-blue-600 border border-blue-100/50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30 font-medium">
                   {tag.trim()}
                 </span>
               ))}
             </div>
             <div className="flex items-center gap-4">
               <span className="text-2xl text-slate-400 dark:text-slate-500 font-medium tracking-wide">
                 {word.phonetic}
               </span>
               <AudioButton
                 word={word.word}
                 audioSrc={audioSrc}
                 className="text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10"
               />
             </div>
           </div>
 
           {/* Meaning - Clean sans-serif, softer slate color */}
           <div className="relative">
             <SectionHeader>{t('wordDetail.meaning', 'Meaning')}</SectionHeader>
             <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line text-[1.05rem] leading-[1.8] font-medium">
               {word.meaning}
             </p>
           </div>
 
           {/* Roots & Synonyms - Clean, structurally aligned without cards */}
           {(word.roots || word.synonyms) && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               {word.roots && (
                 <div>
                   <SectionHeader>{t('wordDetail.roots', 'Roots & memory')}</SectionHeader>
                   <p className="text-slate-600 dark:text-slate-400 text-[0.95rem] leading-relaxed whitespace-pre-line">
                     {word.roots}
                   </p>
                 </div>
               )}
               {word.synonyms && (
                 <div>
                   <SectionHeader>{t('wordDetail.synonyms', 'Synonyms')}</SectionHeader>
                   <p className="text-slate-600 dark:text-slate-400 text-[0.95rem] leading-relaxed whitespace-pre-line">
                     {word.synonyms}
                   </p>
                 </div>
               )}
             </div>
           )}
 
           {/* Examples - Beautifully indented with no container borders */}
           {examples.length > 0 && (
             <div>
               <div className="flex items-center gap-2 mb-4">
                 <SectionHeader>{t('wordDetail.examples', 'Examples')}</SectionHeader>
                 <span className="text-[11px] font-medium text-slate-300 dark:text-slate-600 mb-4 ml-1">
                   ({examples.length})
                 </span>
               </div>
               <div className="space-y-6">
                 {examples.map((example, index) => {
                   const englishText = extractEnglish(example)
                   return (
                     <div key={index} className="flex items-start gap-4 group">
                       <AudioButton
                         text={englishText}
                         useTTS={true}
                         isExample={true}
                         size={16}
                         className="mt-1 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                       />
                       <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line text-[0.95rem] leading-relaxed">
                         {example}
                       </p>
                     </div>
                   )
                 })}
               </div>
             </div>
           )}
 
           {/* Personal Note - Light, fresh blue-tinted textarea */}
           <div className="pt-6 border-t border-slate-100 dark:border-slate-800/60">
             <div className="flex items-center justify-between mb-2">
               <SectionHeader>{t('wordDetail.notes', 'Personal notes')}</SectionHeader>
               <div className="flex items-center gap-2 mb-4">
                 {isSavingNote && (
                   <span className="text-[11px] uppercase tracking-wider text-slate-400 animate-pulse">
                      {t('wordDetail.saving', 'Saving...')}
                   </span>
                 )}
                 {savedSuccess && (
                   <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-primary-500">
                     <Check size={12} strokeWidth={3} /> {t('wordDetail.saved', 'Saved')}
                   </span>
                 )}
               </div>
             </div>
             <div className="relative group">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={handleSaveNote}
                  placeholder={t('wordDetail.notePlaceholder', 'Add your mnemonics, associations, or reflections...')}
                  className="w-full p-4 bg-blue-50/40 hover:bg-blue-50/70 focus:bg-blue-50 dark:bg-slate-800/30 dark:hover:bg-slate-800/50 dark:focus:bg-slate-800/80 rounded-2xl text-slate-700 dark:text-slate-200 placeholder:text-slate-400/70 focus:outline-none ring-1 ring-transparent focus:ring-blue-200/50 dark:focus:ring-slate-700 resize-none min-h-[120px] transition-all text-[0.95rem] leading-relaxed"
                />
             </div>
           </div>
         </div>
       </div>
     </div>
   )
 }
