import React, { useState } from 'react';
import { Home, BookOpen, Brain, Settings, ChevronLeft, ChevronRight, Upload, Languages, BarChart2, Bot } from 'lucide-react';

/*
  This is a standalone, simplified version of the collapsible sidebar with tooltips.
  It uses standard Tailwind CSS classes. You can easily port this to another React/Tailwind project.

  To use this:
  1. Make sure you have `lucide-react` installed: npm install lucide-react
  2. Make sure you have Tailwind CSS setup in your project.
  3. Include the custom CSS below in your global CSS file if you want the custom scrollbar or glassmorphism effect.
*/

/*
  --- Custom CSS to add to your index.css or global stylesheet ---

  .glass-sidebar {
    background-color: rgba(248, 250, 252, 0.9);
    backdrop-filter: blur(24px);
    border-right: 1px solid rgba(226, 232, 240, 0.5);
  }

  .dark .glass-sidebar {
    background-color: rgba(15, 23, 42, 0.9);
    border-right: 1px solid rgba(51, 65, 85, 0.5);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(203, 213, 225, 0.8);
    border-radius: 10px;
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(71, 85, 105, 0.8);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(148, 163, 184, 0.8);
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(100, 116, 139, 0.8);
  }
*/

export default function CollapsibleSidebarReference() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState('add');

  const navItems = [
    { id: 'add', icon: <Home size={22} />, label: '词汇中心', tooltip: '搜索和添加新单词', badge: 0 },
    { id: 'import', icon: <Upload size={22} />, label: '批量导入', tooltip: 'TXT/CSV 批量导入', badge: 0 },
    { id: 'list', icon: <BookOpen size={22} />, label: '单词列表', tooltip: '管理已收藏的单词', badge: 0 },
    { id: 'review', icon: <Brain size={22} />, label: '智能复习', tooltip: '使用 SM-2 算法复习', badge: 5 }, // Example badge
    { id: 'stats', icon: <BarChart2 size={22} />, label: '学习统计', tooltip: '查看学习进度和热力图', badge: 0 },
    { id: 'translation', icon: <Languages size={22} />, label: '翻译助手', tooltip: '多语言智能翻译助手', badge: 0 },
    { id: 'chat', icon: <Bot size={22} />, label: 'AI 语伴', tooltip: '拥有长期记忆的对话练习', badge: 0 },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar Container */}
      <aside
        className={`glass-sidebar flex flex-col transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-48'
        } shrink-0 relative z-50`}
      >
        {/* Header with Logo and Collapse Button */}
        <div className="h-16 flex items-center gap-3 px-4 shrink-0">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>

          {/* Logo - hidden when collapsed */}
          <h1
            className={`font-bold text-lg bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent whitespace-nowrap transition-all duration-300 flex-1 min-w-0
              ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}
          >
            智能生词本
          </h1>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                // Tooltip is implemented using the standard HTML 'title' attribute.
                // It only shows the tooltip text when the sidebar is collapsed.
                title={isCollapsed ? item.tooltip : ''}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer overflow-hidden group relative
                  ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
              >
                {/* Icon Container */}
                <span className="shrink-0 relative">
                  {item.icon}
                  {/* Badge showing when collapsed */}
                  {item.badge > 0 && isCollapsed && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center shadow-sm border border-white dark:border-slate-900">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>

                {/* Label Container - animates opacity and width when collapsing */}
                <span
                  className={`whitespace-nowrap transition-all duration-300 ml-3
                    ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}
                >
                  {item.label}
                </span>

                {/* Badge showing when expanded */}
                {item.badge > 0 && !isCollapsed && (
                  <span className="ml-auto px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}

                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Section (e.g., Settings) */}
        <div className="p-3 space-y-3 pb-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setCurrentPage('settings')}
            title={isCollapsed ? "应用设置" : ''}
            className={`group flex items-center gap-3 w-full p-2.5 rounded-xl transition-all duration-200 overflow-hidden
              ${
                currentPage === 'settings'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold shadow-sm border border-blue-100 dark:border-blue-800/50'
                  : 'hover:bg-white dark:hover:bg-slate-800 hover:shadow-md border border-transparent hover:border-slate-100 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0
                ${
                  currentPage === 'settings'
                    ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:scale-110 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                }`}
            >
              <Settings size={20} />
            </div>
            <span
              className={`text-sm text-left whitespace-nowrap transition-all duration-300 ml-3
                ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto'}`}
            >
              设置
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area (Dummy Content) */}
      <main className="flex-1 p-8">
        <h2 className="text-2xl font-bold mb-4">主内容区域</h2>
        <p className="text-slate-600 dark:text-slate-400">
          点击左上方按钮可测试侧边栏的展开和折叠。当侧边栏折叠时，将鼠标悬停在图标上即可看到原生的 Tooltips 提示（通过 HTML <code>title</code> 属性实现）。
        </p>
      </main>
    </div>
  );
}
