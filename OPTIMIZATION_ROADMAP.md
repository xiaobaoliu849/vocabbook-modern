# VocabBook 优化路线图

> 最后更新: 2026-02-02

本文档基于专业单词软件（Anki, 墨墨背单词, Quizlet, 欧路词典）的核心功能分析，按 **用户价值/实现成本** 比率排序。

---

## 📊 影响力评估标准

| 评级 | 含义 |
|:----:|------|
| 🔥🔥🔥 | **革命性提升** - 显著提高学习效率或用户留存 |
| 🔥🔥 | **重要增强** - 明显改善用户体验 |
| 🔥 | **锦上添花** - 细节优化 |

---

## 🏆 第一梯队：革命性提升 (建议优先实现)

### 1. 多种复习模式 🔥🔥🔥

**当前问题**: 只有拼写练习，单一模式容易疲劳，且不适合所有场景

**解决方案**: 增加以下模式
- [x] **选择题模式** - 从词库随机抽取干扰项，降低复习门槛
- [x] **听写模式** - 播放发音，用户输入单词
- [ ] **词义匹配** - 左右连线匹配单词和释义
- [x] **闪卡模式** - 简单的翻转卡片，适合快速浏览

**学习科学依据**:
> 多样化的测试方式（Testing Effect）比单一方式能提高 30-50% 的长期记忆保持率

**实现复杂度**: ⭐⭐⭐ (3-4天)

**文件影响**:
- `frontend/src/pages/Review.tsx` - 重构为多模式架构
- 新增 `frontend/src/components/review/` 目录
  - `ChoiceMode.tsx`
  - `DictationMode.tsx`
  - `FlashcardMode.tsx`

---

### 2. 词书导入系统 🔥🔥🔥

**当前问题**: 用户只能逐个添加单词，无法批量学习标准词汇表

**解决方案**:
- [ ] 内置 CET4/CET6/TOEFL/GRE 等常用词书
- [ ] 支持从 TXT/CSV 批量导入
- [ ] 词书进度追踪（已学/未学/已掌握）

**为什么重要**:
> 这是 **墨墨背单词** 等软件的核心竞争力。用户通常有明确的考试目标，需要系统性学习标准词库。

**实现复杂度**: ⭐⭐⭐ (2-3天)

**文件影响**:
- 新增 `backend/wordbooks/` 目录存放词书 JSON
- 新增 `backend/routers/wordbook.py`
- 新增 `frontend/src/pages/WordbookImport.tsx`
- 修改 `frontend/src/components/Sidebar.tsx`

---

### 3. 困难词本 (自动生成) 🔥🔥🔥

**当前问题**: 反复记错的单词和其他单词混在一起，无法针对性强化

**解决方案**:
- [ ] 自动标记错误次数 ≥3 的单词为"困难词"
- [ ] 独立的困难词复习入口
- [ ] 困难词专属复习策略（更短间隔、更多重复）

**学习科学依据**:
> 间隔效应 (Spacing Effect) 表明，针对困难内容增加复习频次可显著提高记忆效果

**实现复杂度**: ⭐⭐ (1天)

**数据库变更**:
```sql
ALTER TABLE words ADD COLUMN error_count INTEGER DEFAULT 0;
```

**文件影响**:
- `backend/models/database.py` - 添加 `error_count` 字段和相关查询
- `frontend/src/pages/Review.tsx` - 记录错误次数
- `frontend/src/components/Sidebar.tsx` - 添加困难词入口

---

## 🥈 第二梯队：重要增强

### 4. 学习目标与提醒 🔥🔥

**描述**:
- [ ] 设置每日目标（新学 X 个，复习 Y 个）
- [ ] 桌面通知提醒复习时间
- [ ] 目标完成进度条

**文件影响**:
- `frontend/src/pages/settings/StudySettings.tsx` - 新增目标设置
- `electron/main.js` - 添加系统通知
- `frontend/src/App.tsx` - 添加进度条组件

---

### 5. 词汇量测试 🔥🔥

**描述**: 类似 [Test Your Vocab](https://testyourvocab.com/) 的词汇量估算

- [ ] 随机抽样不同难度单词
- [ ] 根据认识比例估算总词汇量
- [ ] 历史测试记录对比

**实现复杂度**: ⭐⭐⭐ (2天)

---

### 6. 学习报告可视化 🔥🔥

**描述**: 利用现有 `review_history` 表生成图表

- [ ] 每周学习时长趋势图
- [ ] 正确率变化曲线
- [ ] 词汇掌握分布饼图

**推荐库**: `recharts` (React 图表库，已安装友好)

---

### 7. 虚拟滚动 🔥🔥

**当前问题**: WordList 页面在词汇量 > 1000 时可能卡顿

**解决方案**: 使用 `@tanstack/react-virtual` 实现虚拟列表

**实现复杂度**: ⭐⭐ (半天)

---

## 🥉 第三梯队：锦上添花

### 8. 例句来源扩展 🔥

- [ ] 集成 Tatoeba API 获取真实例句
- [ ] 显示例句来源标注

### 9. 词频信息 🔥

- [ ] 集成 COCA 词频数据
- [ ] 根据词频显示难度标签

### 10. PWA 离线支持 🔥

- [ ] Service Worker 缓存策略
- [ ] 离线时使用本地数据

### 11. 全局快捷键优化 🔥

- [ ] 托盘图标 + 右键菜单
- [ ] 划词取词功能

---

## 📅 推荐实施顺序

```
Week 1: 困难词本 + 多复习模式基础版 (选择题)
Week 2: 词书导入系统
Week 3: 学习目标 + 报告可视化
Week 4: 虚拟滚动 + 性能优化
```

---

## 🔗 相关资源

- [间隔重复学习科学](https://www.gwern.net/Spaced-repetition)
- [Anki 设计理念](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html)
- [Test Your Vocab](https://testyourvocab.com/)

---

## ✅ 已完成的优化 (2026-02)

- [x] 前端: `useDebounce` 搜索防抖
- [x] 前端: `AudioPool` 音频对象复用
- [x] 前端: `ErrorBoundary` 错误边界
- [x] 前端: 集中 API 管理 (`utils/api.ts`)
- [x] 后端: LRU 词典缓存 (500条/5分钟)
- [x] 后端: 精简字段查询 `get_words_for_list()`
- [x] 数据库: 长连接池 + WAL 模式
- [x] 前端: **多模式复习系统** (识记/拼写/选择/听写)
- [x] 前端: **练习模式** (随机复习所有单词)
- [x] UI: 智能复习界面布局优化 (防遮挡设计)
