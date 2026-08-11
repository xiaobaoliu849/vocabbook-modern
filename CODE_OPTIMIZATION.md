# Code-Level Optimization Checklist

> 代码级优化清单（与 `OPTIMIZATION_ROADMAP.md` 的**功能路线图**区分）。
> 最后更新: 2026-08-11
> 规则：每完成一条，把 `[ ]` 改为 `[x]`，并写明验证方式。

## 后端

### 高优先级

- [x] **1. 导入流程完全串行** — `backend/routers/import_words.py` `process_import` 已改为：一次批量查重（新增 `get_existing_words`，分块防 SQLite 变量上限）、并发查词典/下载音频（asyncio.gather + 信号量）、单个事务 `executemany` 批量插入（新增 `add_words_batch`）；结果语义保持兼容，另补了 5 个批量方法测试。
- [x] **2. 启动音频回填串行下载** — `backend/routers/words.py` `/backfill-audio` 已并发化（信号量限制 3 个并发下载），跳过已有音频的词。
- [x] **3. 提交复习串行 DB 往返** — `backend/routers/review.py` `submit_review` 原来 4 次往返（get_word → update → get_word → get_due_count）。已改为：`update_sm2_status` 在同一连接上返回剩余 due count，路由不再二次 get_word（用第一次读取的 error_count 精确推算），共 2 次往返。
- [x] **4. 两套并行仓储层** — 实际情况是“实现层 + 转发层”：删除了零逻辑的 `chat_repository.py`（`ai.py` 改用 `ChatRepository`，4 个调用点已更新）；`get_difficult_words` 的 SQL 收进 `reviews_repo.py`，`ReviewRepository` 改为纯转发（SQL 单一来源）。
- [x] **5. 内存词典缓存无上限** — `backend/services/multi_dict_service.py` `_memory_cache` 已改为 `OrderedDict` + `RLock`，上限 2000 条按 LRU 淘汰，并补了测试。
- [x] **6. 进程内第二个 DatabaseManager** — `multi_dict_service.get_db_manager()` 现在优先复用 `main.get_db()` 的全局实例，仅应用未运行时（如测试）才自建。
- [x] **7. 每次查词典新建 ThreadPoolExecutor** — `aggregate_search` 改用模块级共享 `_dict_executor`，并在 `main.py` 关闭流程中一并 shutdown。

### 中等优先级

- [ ] **8. 标签存为逗号分隔字符串** — `tags LIKE ?` 无法走索引且误匹配（`%art%` 命中 "smart"）；`get_all_tags` 每次全表扫描。优化：规范化为 `word_tags` 关联表。
- [ ] **9. `/api/words/all` 返回整表** — 前端未使用。决定：**保留**（避免破坏仓库外脚本/工具的隐式依赖），如确认无外部依赖再删。
- [x] **10. `reviews_repo.py` UPDATE 后多余 SELECT id** — 改为单条 `INSERT ... SELECT id FROM words WHERE word = ?`，去掉独立 SELECT。
- [x] **11. SQLite PRAGMA 补充** — `get_connection` 已加 `busy_timeout=5000` 和 `cache_size=-16000`（约 16MB 页缓存）。

## 前端

### 高优先级

- [x] **12. 两套音频实现** — `utils/audio.ts` `playWordAudio` 每次 `new Audio()`，绕过 `performance.ts` 的 `AudioPool`。已改为走 `audioPool`。
- [x] **13. 页面从不卸载** — `App.tsx` 改为有界 LRU keep-alive：最多保留 3 个最近访问的非聊天页（聊天页永不卸载，保留对话状态），超限卸载最久未访问的页面以限制内存；`WordList`/`Review` 仍靠 `isActive` 重新拉取保持新鲜。
- [x] **14. WordList 每次数据变化全量重拉** — `fetchTags` 改用 60s TTL 缓存（命中缓存即不重发）；单词增删改时通过 `GlobalStateContext` 失效标签缓存，保证新鲜。
- [x] **15. 请求无去重/TTL 缓存** — `api.get` 支持 `ttl` 选项：内存 TTL 缓存 + 并发请求去重（in-flight 合并），并导出 `invalidateGetCache(prefix)`；仅稳定接口（标签）启用，词表等需新鲜的请求保持直连。
- [x] **16. 练习模式参数名不对齐** — `Review.tsx` 传 `limit=50`，后端参数是 `page_size`。已改为 `page_size=50`。

### 中等优先级

- [ ] **17. `handleRating` 闭包过期风险** — 加载下一批单词时读取渲染时捕获的 `dueWords`/`currentIndex`，快速按键下可能重复追加。优化：函数式更新 / ref。

## Electron

- [ ] **18. 无后端就绪握手** — 窗口在 `ready-to-show` 即显示，后端还在启动，首屏抢跑报错。优化：轮询 `/health` 后再显示，或前端启动重试。
- [ ] **19. 窗口隐藏到托盘后定时器继续跑** — 60s due-count 轮询不停。优化：监听 `visibilitychange` 暂停。

## 已完成

- [x] #1 导入流程批量改造（后端）
- [x] #2 启动音频回填并发化（后端）
- [x] #3 复习提交减少串行 DB 往返（后端）
- [x] #4 仓储层去重（后端）
- [x] #5/#6/#7 词典服务：缓存加锁+LRU 上限、复用主 DB 实例、共享线程池（后端）
- [x] #10 去掉 UPDATE 后多余 SELECT（后端）
- [x] #11 SQLite PRAGMA 补充（后端）
- [x] #12 音频播放统一走 AudioPool（前端）
- [x] #13 页面有界 LRU keep-alive（前端）
- [x] #14 WordList 标签 TTL 缓存 + 变更失效（前端）
- [x] #15 api.get 支持 TTL 缓存与并发去重（前端）
- [x] #16 练习模式请求参数对齐（前端）

## 验证记录

- 2026-08-11：后端 `backend/tests` 96 passed（含新增 7 个测试）；前端 `npm run build` + 29 个单测通过；`main` 导入正常（60 条路由）。
- 2026-08-11 第二轮：完成 #1/#2/#4/#5/#6/#7/#10/#11；未改动任何路由行为（`/api/words/all` 保留）。
- 2026-08-11 对抗性审查：修复了导入逐词异常会整批 500 的回归（补了回归测试）、批量插入失败回退逐词插入、backfill 逐词容错、audio/performance 循环依赖；前端单测 29 passed。
- 2026-08-11 第三轮：完成 #13/#14/#15（前端）；`npm run build` + 29 单测通过；期间修复一个 `Set<Page>` 类型收窄导致的 tsc 错误。
- 备注：构建产物中 `mermaid-vendor` 单块约 3 MB（gzip 828 KB），但已按需动态导入，不影响首屏；若在意体积可后续评估拆包或替换。
- 后端：`cd backend && ../.venv-win/Scripts/python.exe -m pytest tests -q`
- 前端：`cd frontend && npm run build`
