// 陛下，这是 AddWord.tsx 需要添加的例句播放按钮代码
// 找到文件中的 /* Example */ 部分，替换成以下内容：

{/* Example */}
{currentData?.example && (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <h4 className="font-bold text-slate-700 dark:text-slate-200">例句</h4>
      <AudioButton 
        text={currentData.example}
        useTTS={true}
        isExample={true}
        size={16}
        className="bg-emerald-50 dark:bg-emerald-900/20"
      />
    </div>
    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed text-sm font-mono">
        {currentData.example}
      </p>
    </div>
  </div>
)}

// AI 生成的例句部分也添加播放按钮：
{aiSentences.length > 0 && (
  <div className="space-y-2">
    {aiSentences.map((sentence, i) => (
      <div key={i} className="bg-accent-50 dark:bg-accent-900/20 rounded-lg p-3 text-slate-700 dark:text-slate-300 animate-slide-up flex items-start gap-2" style={{ animationDelay: `${i * 0.1}s` }}>
        <AudioButton 
          text={sentence}
          useTTS={true}
          isExample={true}
          size={16}
          className="flex-shrink-0 mt-0.5"
        />
        <span>{sentence}</span>
      </div>
    ))}
  </div>
)}
