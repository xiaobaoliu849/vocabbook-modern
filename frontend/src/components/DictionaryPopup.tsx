import { useState, useEffect, useRef } from 'react';
import { api, ApiError, API_PATHS, getClientId } from '../utils/api';
import AudioButton from './AudioButton';
import { useGlobalState } from '../context/GlobalStateContext';
import { X, Search, Heart, Loader2, Plus, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../context/AuthContext';

interface Position {
    top: number;
    left: number;
}

export default function DictionaryPopup() {
    const [isVisible, setIsVisible] = useState(false);
    const [word, setWord] = useState('');
    const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [isSaved, setIsSaved] = useState(false);
    const [error, setError] = useState('');

    // Config states
    const [autoPlay, setAutoPlay] = useState(true);
    const [autoSave, setAutoSave] = useState(false);
    const { notifyWordAdded } = useGlobalState();

    // AI Explanation states
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [showAiExplanation, setShowAiExplanation] = useState(false);
    const [aiContent, setAiContent] = useState('');

    const popupRef = useRef<HTMLDivElement>(null);

    // Form drag state
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.left,
            y: e.clientY - position.top,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setPosition({
            top: e.clientY - dragOffset.current.y,
            left: e.clientX - dragOffset.current.x,
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const { token } = useAuth();

    useEffect(() => {
        setAutoPlay(localStorage.getItem('auto_play') !== 'false');
        setAutoSave(localStorage.getItem('auto_save') === 'true');
    }, [isVisible]); // Refresh config when opening

    const saveWord = async (data: any, silent = false) => {
        try {
            await api.post(API_PATHS.WORDS, data);
            notifyWordAdded();
            return 'success';
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                return 'exist';
            }
            if (!silent) alert('❌ 添加失败');
            return 'error';
        }
    };

    const fetchDefinition = async (searchWord: string) => {
        setLoading(true);
        setError('');
        setResult(null);
        setIsSaved(false);
        setShowAiExplanation(false);
        setAiContent('');
        try {
            const enabledDicts = ['youdao'];
            ['cambridge', 'bing', 'freedict'].forEach(id => {
                if (localStorage.getItem(`dict_${id}`) !== 'false') {
                    enabledDicts.push(id);
                }
            });

            const sourcesParam = enabledDicts.join(',');
            const data = await api.get(API_PATHS.DICT_SEARCH(searchWord, sourcesParam));
            setResult(data);

            if (autoPlay) {
                const audioSrc = `https://dict.youdao.com/dictvoice?audio=${data.word}&type=2`;
                const audio = new Audio(audioSrc);
                audio.play().catch(e => console.error("Auto-play blocked:", e));
            }

            if (autoSave) {
                const res = await saveWord(data, true);
                if (res === 'success' || res === 'exist') {
                    setIsSaved(true);
                }
            } else {
                try {
                    const savedWord = await api.get(API_PATHS.WORD(data.word));
                    setIsSaved(!!savedWord && !savedWord.error);
                } catch (err) {
                    setIsSaved(false);
                }
            }
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                setError('未找到该单词');
            } else {
                setError('查询失败，请检查后端服务');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleSearchWord = (e: Event) => {
            const customEvent = e as CustomEvent;
            const text = customEvent.detail;
            if (!text || typeof text !== 'string') return;

            // Clean word
            const cleanText = text.trim();
            if (!cleanText) return;

            setWord(cleanText);

            // Try to get selection coordinates
            let topPosition = Math.max(100, window.scrollY + 100);
            let leftPosition = window.innerWidth / 2 - 160;

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && selection.toString().trim() !== '') {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Position below the text
                topPosition = rect.bottom + window.scrollY + 15;
                leftPosition = rect.left + window.scrollX;

                // Keep within viewport bounds
                const popupWidth = 340; // Estimated width
                if (leftPosition + popupWidth > window.innerWidth) {
                    leftPosition = window.innerWidth - popupWidth - 20;
                }
                if (leftPosition < 10) leftPosition = 10;
            }

            setPosition({ top: topPosition, left: leftPosition });
            setIsVisible(true);
            fetchDefinition(cleanText);
        };

        window.addEventListener('search-word', handleSearchWord);
        return () => window.removeEventListener('search-word', handleSearchWord);
    }, [autoPlay, autoSave]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                // Ignore left clicks on the context menu if any, or if user is starting a new selection.
                // It is safer to close the popup if they click outside.
                setIsVisible(false);
            }
        };

        // Also close on ESC
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsVisible(false);
        }

        if (isVisible) {
            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
                document.addEventListener('keydown', handleEsc);
            }, 50); // slight delay to prevent immediate closure from the triggering click
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [isVisible]);

    const handleAddWord = async () => {
        if (!result || result.error) return;
        const res = await saveWord(result, false);
        if (res === 'success' || res === 'exist') {
            setIsSaved(true);
        }
    };

    const handleAiExplanation = async () => {
        if (!word) return;

        setShowAiExplanation(true);
        if (aiContent) return; // Already generated

        setIsAiLoading(true);
        setAiContent('');

        try {
            // Re-fetch ai settings right before call to ensure latest
            const provider = localStorage.getItem('ai_provider') || 'dashscope';
            const keysMap = JSON.parse(localStorage.getItem('ai_api_keys_map') || '{}');
            const apiKey = keysMap[provider] || localStorage.getItem('ai_api_key') || '';
            const modelsMap = JSON.parse(localStorage.getItem('ai_models_map') || '{}');
            const model = modelsMap[provider] || localStorage.getItem('ai_model') || 'qwen-plus';
            const basesMap = JSON.parse(localStorage.getItem('ai_bases_map') || '{}');
            const apiBase = basesMap[provider] || '';

            const evermemEnabled = localStorage.getItem('evermem_enabled') || 'false';
            const evermemUrl = localStorage.getItem('evermem_url') || '';
            const evermemKey = localStorage.getItem('evermem_key') || '';

            const prompt = `请详细解析单词 '${word}'。要求：\n1. 核心词义与语境\n2. 常见搭配\n3. 巧妙的助记方法\n4. 两个典型的日常交流例句\n请保持排版清晰，解释生动自然，直接输出内容，不用寒暄。`;

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${API_PATHS.AI_CHAT_STREAM}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Client-Id': getClientId(),
                    'X-AI-Provider': provider,
                    'X-AI-Key': apiKey,
                    'X-AI-Model': model,
                    'X-AI-Base': apiBase,
                    'X-EverMem-Enabled': evermemEnabled,
                    'X-EverMem-Url': evermemUrl,
                    'X-EverMem-Key': evermemKey,
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
                    context_word: word
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 403 && errorData?.detail?.message?.includes("exceeded")) {
                    setAiContent('⚠️ 你的 AI 请求次数已耗尽，请升级会员或明日再来。');
                } else {
                    setAiContent('⚠️ AI 生成请求失败，请检查设置。');
                }
                setIsAiLoading(false);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');

            if (reader) {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    // Provide a smooth typing effect
                    setAiContent(prev => prev + chunk);
                }
            }
        } catch (error) {
            console.error("AI Explanation error:", error);
            setAiContent('⚠️ AI 生成出错，请稍后重试。');
        } finally {
            setIsAiLoading(false);
        }
    };

    if (!isVisible) return null;

    // Use youdao as primary or fallback to whatever is there
    const displayData = result?.sources_data?.['youdao'] || result;

    return (
        <div
            ref={popupRef}
            className="absolute z-[9999] w-[340px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/60 flex flex-col overflow-hidden animate-scale-up"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                maxHeight: '400px',
            }}
        >
            {/* Header / Drag Handle area mock */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/80 shrink-0 cursor-move select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
                    <Search size={16} className="text-slate-400 flex-shrink-0" />
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{word}</span>
                </div>
                <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setIsVisible(false)}
                    className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 transition-colors shrink-0"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Content Area - Scrollable */}
            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar text-left items-start">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                        <Loader2 size={24} className="animate-spin mb-2" />
                        <span className="text-sm">查询中...</span>
                    </div>
                ) : error ? (
                    <div className="text-center py-6 text-slate-500">
                        <p className="text-sm">{error}</p>
                    </div>
                ) : result?.word ? (
                    <div className="space-y-4">
                        {/* Word Info Header */}
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">
                                    {result.word}
                                </h3>
                                {(displayData?.phonetic || result.phonetic) && (
                                    <p className="text-sm text-slate-500 font-serif">
                                        {displayData?.phonetic || result.phonetic}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <AudioButton
                                    word={result.word}
                                    audioSrc={displayData?.audio}
                                    className="!p-1.5"
                                    size={16}
                                />
                                {!isSaved ? (
                                    <button
                                        onClick={handleAddWord}
                                        title="添加到生词本"
                                        className="p-1.5 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/40 dark:text-primary-400 transition-colors"
                                    >
                                        <Plus size={16} />
                                    </button>
                                ) : (
                                    <button
                                        disabled
                                        title="已在生词本中"
                                        className="p-1.5 rounded-lg bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 cursor-default"
                                    >
                                        <Heart size={16} fill="currentColor" />
                                    </button>
                                )}
                                <button
                                    onClick={handleAiExplanation}
                                    title="AI 深入解析"
                                    className={`p-1.5 rounded-lg transition-colors ${showAiExplanation
                                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400'
                                        }`}
                                >
                                    <Sparkles size={16} className={isAiLoading ? "animate-pulse" : ""} />
                                </button>
                            </div>
                        </div>

                        {/* Meaning */}
                        {displayData?.meaning && (
                            <div className="text-[14px] text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                {displayData.meaning}
                            </div>
                        )}

                        {/* Example (truncate if too long or just show first) */}
                        {displayData?.example && (
                            <div className="mt-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                {displayData.example.split('\n').map((line: string, idx: number) => {
                                    const hasChinese = /[\u4e00-\u9fa5]/.test(line);
                                    const hasLetters = /[a-zA-Z]/.test(line);
                                    const showAudio = !hasChinese && hasLetters;

                                    return (
                                        <div key={idx} className={`flex items-start gap-2 ${idx !== 0 ? 'mt-2' : ''}`}>
                                            <p className={`text-[13px] font-mono leading-relaxed flex-1 ${showAudio ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-500 ml-1'}`}>
                                                {line}
                                            </p>
                                            {showAudio && (
                                                <div className="shrink-0 mt-0.5">
                                                    <AudioButton
                                                        text={line}
                                                        isExample={true}
                                                        size={14}
                                                        className="!p-1"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Tags */}
                        {result.tags && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {result.tags.split(',').slice(0, 3).map((tag: string) => (
                                    <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                        {tag.trim()}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* AI Explanation Area */}
                        {showAiExplanation && (
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 animate-fade-in relative">
                                <div className="absolute top-0 right-0 -mt-2.5 bg-white dark:bg-slate-800 px-2 text-xs font-semibold text-indigo-500 flex items-center gap-1">
                                    <Sparkles size={12} />
                                    AI 解析
                                </div>
                                <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-headings:text-slate-700 dark:prose-headings:text-slate-300 prose-a:text-indigo-500 max-w-none text-[13px] text-slate-600 dark:text-slate-300">
                                    {aiContent ? (
                                        <ReactMarkdown>{aiContent}</ReactMarkdown>
                                    ) : (
                                        <div className="flex items-center gap-2 text-indigo-400/70 py-4 justify-center whitespace-pre">
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>正在由 AI 生成深度解析...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-4 text-slate-400 text-sm">暂无数据</div>
                )}
            </div>
        </div>
    );
}
