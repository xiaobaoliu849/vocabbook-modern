import { useState } from 'react'

export default function DictionarySection() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    词典源设置
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    管理查词时使用的词典资源
                </p>
            </div>

            <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    📚 启用词典
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                    在查询单词时启用多个词典以获取更全面的释义
                </p>

                <div className="space-y-4">
                    {[
                        { id: 'youdao', name: '有道词典', desc: '中文释义准确，词根词缀丰富', fixed: true },
                        { id: 'cambridge', name: 'Cambridge Dictionary', desc: '权威英英释义，高质量例句' },
                        { id: 'bing', name: 'Bing 词典', desc: '词形变化、常用搭配' },
                        { id: 'freedict', name: 'Free Dictionary', desc: '英英释义，深度理解词义' },
                    ].map((dict) => {
                        const [enabled, setEnabled] = useState(() => {
                            const saved = localStorage.getItem(`dict_${dict.id}`);
                            return dict.fixed || (saved !== 'false');
                        });

                        const toggleDict = () => {
                            if (dict.fixed) return;
                            const newState = !enabled;
                            setEnabled(newState);
                            localStorage.setItem(`dict_${dict.id}`, String(newState));
                        };

                        return (
                            <div key={dict.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                <div>
                                    <div className="font-medium text-slate-700 dark:text-slate-300">
                                        {dict.name}
                                    </div>
                                    <div className="text-xs text-slate-500">{dict.desc}</div>
                                </div>
                                <button
                                    onClick={toggleDict}
                                    disabled={dict.fixed}
                                    className={`relative w-12 h-6 rounded-full transition-colorscursor-pointer ${enabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
                                        } ${dict.fixed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    <div
                                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${enabled ? 'translate-x-7' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    )
}
