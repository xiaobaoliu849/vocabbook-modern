# 2026-08-23 全项目健壮性重扫发现清单（第六批候选）

> 7 个子系统并行深审（后端路由 / 后端服务 / 后端数据层 / cloud_server / 前端 pages / 前端组件+utils / Electron+构建+i18n），全部逐文件通读并要求给 file:line + 失败场景。
> **P2 共 11 条已由主会话逐条人工核实为真**（含本机实测复现 2 条：非 ASCII header 崩溃、aware datetime 落库）。
> 承接：`docs/engineering/2026-08-22-robustness-round4-5-handoff.md`（第四/五批已提交推送 `077948d..430f3d4`）。
> 本文档只记录发现，未包含修复。

## 汇总

| 子系统 | P2 | P3 |
|--------|----|----|
| 后端路由层 | 2 | 11 |
| 后端服务层 | 1 | 10 |
| 后端数据层 | 1* | 10 |
| cloud_server | 1 | 11 |
| 前端 pages | 1 | 8 |
| 前端组件+utils | 3 | 9 |
| Electron+构建+i18n | 4 | 8 |
| **去重合计** | **11** | **~67** |

\* 与路由层/服务层重复，系同一条（limit_service），去重后计入一次。三个独立 agent 交叉命中。

---

## P2（11 条，建议全部修复）

### 后端

**P2-1 | backend/services/limit_service.py:48-58,115-124 | 日额度检查-消费非原子 + 首用并发 UNIQUE 500**
两个并发请求首次触发同一 feature（或跨零点同时重置）都走 SELECT→INSERT，后者撞 `user_limits.feature` UNIQUE 抛 IntegrityError（非 LimitException）→ `/api/ai/*`、`/api/tts` 直接 500；读计数与盲目 +1 分属两事务，N 个并发免费请求都读到 max-1 后各自放行，日限额可超 N-1 次。
⚠️ **运行时真正执行的是 limit_service 内联 SQL；`repositories/limits_repo.py` 整个是死代码，无生产调用方——只修 repo 会白修。**
修法：单条原子 upsert（`INSERT ... ON CONFLICT(feature) DO UPDATE SET used_count=used_count+1, ... WHERE last_reset_date < ?`）判 rowcount；删除或合并死 repo。

**P2-2 | backend/services/evermem_service.py:127-128 | 附件缺 type/uri 键 → 聊天接口崩**
add_memory 在 try 块之前 `a["type"]` 直取键；`_prepare_evermem_context`（ai_service.py:831）无 try 包裹，chat_stream 的 prep 位于 try 之外（ai_service.py:958-963）——StreamingResponse 已发响应头后生成器首拉即抛，连接中断无任何 SSE error/done；非流式则 500。
修法：`.get()` 取键缺失即忽略该附件，或给 prep 调用套 try。

**P2-3 | backend/routers/dictionary.py:106 | 音频接口对非 ASCII 单词必崩**
`Content-Disposition: inline; filename={trimmed}.mp3` 含中文/日文等（TTS 明确支持 zh/ja/ko/ru，这些词会被 ensure_audio 写入缓存）时 Starlette 构造 FileResponse 抛 UnicodeEncodeError（已本机 h11/starlette 实测复现）→ 500。
修法：RFC 5987（ASCII 回退名 + `filename*=UTF-8''…`）或 md5 哈希名（同 tts.py）。

### cloud_server

**P2-4 | cloud_server/rate_limit.py:27-29 | XFF 首段可伪造，登录/注册限流完全失效**
`get_client_ip` 取 XFF 最左段；nginx 示例配置（deploy/nginx/vocabbook-cloud.conf.example:19）用 `$proxy_add_x_forwarded_for` 追加式——攻击者每次带随机 XFF，首段恒为伪造值，每个请求都是新桶，`/token` 可无限暴力破解、`/register` 可无限批量注册。可信的 `X-Real-IP`（nginx 覆盖式注入）反而排在 XFF 之后不被采用。
修法：检查顺序调换为先 `X-Real-IP`，或取 XFF 最右段；同步改测试。

### 前端

**P2-5 | frontend/src/pages/AddWord.tsx:141,169,129 | AI 例句跨词污染残留路径（上轮快照配对只堵一半）**
`requestedWord` 取自输入框而非当前词条：搜 "apple" 得到结果后在输入框改成 "apples"（不回车）再点生成例句 → 生成 apples 的句子；守卫只验证"生成期间输入没再变"，`setAiSentences` 无条件执行 → apples 例句渲染在 apple 卡片下；用户保存（handleAddWord:129 把 `searchResult` 与 `aiSentences` 一起传）→ B 词例句持久化进 A 词。
修法：以 `searchResult.word` 为请求词，或仅当快照匹配才 setAiSentences；保存前校验配对。

**P2-6 | frontend/src/hooks/useChatSessionSync.ts:34 | 云端会话同步无超时，挂死即永久停摆**
POST 无 signal 无 timeout；休眠恢复/VPN 断开时挂起 → `syncInFlightRef` 永不清空，此后所有 flush() 直接返回悬挂 Promise——聊天云备份静默停摆直到重启，UI 无报错。
修法：改 api.post 或 mergeAbortSignals 加超时；失败清 syncInFlightRef 并把 batch 放回 pendingSessionsRef。

**P2-7 | frontend/src/context/ThemeContext.tsx:157 等约 12 处 | localStorage 裸读写未包 try/catch**
浏览器禁用存储（SecurityError）或配额满时任一处抛出即崩；Provider 级 effect 位于 ErrorBoundary 之上 → 整页白屏循环。位置：ThemeProvider(:35,157)、ShortcutProvider persistShortcuts(:57)、useAuthStore(:33)、GlobalStateContext(:67)、api.ts `_getHeaders`(:184)、evermem.ts(:25,31)、aiModels.ts(:56-72)、DictionaryPopup(:86,118,261-277)、QuickLookupPopup(:23-32)、Sidebar(:88)。
修法：抽 safeStorage get/set 包装统一替换（getClientId 已有守卫可参照）。

**P2-8 | frontend/src/components/chat/MermaidDiagram.tsx:95,148-153 | 模型输出 mermaid 以 loose+dangerouslySetInnerHTML 渲染 → 渲染进程 XSS**
聊天中提示注入可诱导模型输出含 `<img src=x onerror=…>` 节点标签的 ```mermaid 块；sanitizeMermaidCode 只加引号不转义 HTML，securityLevel:'loose' 的 htmlLabels 使其进入 SVG foreignObject 执行，可读取 localStorage 中的 `ai_api_keys_map` 外传。
修法：securityLevel 改 'strict'（或 sanitize 中转义 `<>`），勿对模型输出用 dangerouslySetInnerHTML。

### Electron / 发布链

**P2-9 | scripts/sign_windows_installer.py:95 | 签名后不重生成 latest.yml/.blockmap，自动更新永久失败**
先 dist:win 再对 exe 签名（字节已变），但脚本只重写 release-manifest.json/notes——latest.yml 里构建时写入的 sha512/size 仍是未签名文件的；发布后 electron-updater 下载校验必报 checksum mismatch，blockmap 也是旧的，此后所有自动更新失败。
修法：签名后按实际文件重算改写 latest.yml（blockmap 重生成或放弃差分）；verify-readiness 增加 yml↔产物一致性校验。

**P2-10 | electron/main.js:388 + preload.js:35 | 托盘「开始复习」是死按钮**
main 发 'navigate-to' → preload 转 CustomEvent('navigate')，但前端无任何 `addEventListener('navigate')`（仅 search-word 有消费者）；点击托盘项只弹窗不跳转。verify-release.mjs:42 只断言 preload 侧存在所以检不出。
修法：App.tsx 挂 'navigate' 监听驱动 setCurrentPage，或删掉该菜单项。

**P2-11 | electron/main.js:57-72,518 | 全局快捷键接受无修饰键裸键，可全局劫持字母**
录制器对任意 keydown 生成绑定，main.js normalizeFrontendShortcutBinding 不要求修饰符——用户录制态误按 V → `globalShortcut.register('V')` 成功，全系统任何应用里按 V 都被吞掉并触发出窗。
修法：注册前校验至少含 Ctrl/Meta/Alt/Shift 之一，否则拒绝。

---

## P3 清单（~67 条）

### 后端路由层（11）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 1 | routers/words.py:211 | POST /words 无视 add_word 返回值，竞态撞 UNIQUE 后仍 201 假成功 | False 时返回 409 |
| 2 | routers/tts.py:44-45,243-244 | 并发淘汰时 getmtime/getsize 抛 FileNotFoundError 未捕获 → 已成功的合成报 500；`*.tmp` 孤儿不在清理过滤内永久泄漏磁盘 | 逐文件 try/except OSError；清理同时匹配 .tmp |
| 3 | routers/review.py:277,348 | fire-and-forget 任务无强引用（可被 GC）且内层无 try → 复习记忆静默丢失（388 行 foresight 反而有） | background_tasks 集合持有 + 内层 try，与 :388 一致 |
| 4 | routers/ai.py:619 | dismiss_foresight 缺 delete_memory 同款属主预检 → 可删任意属主记忆 | 复用属主校验或限定 group_id |
| 5 | repositories/chat_repo.py:147-168 | save_session upsert 无 owner_key WHERE → 同机多账号可互相覆盖会话 | 冲突分支加 `WHERE owner_key=excluded.owner_key` |
| 6 | routers/review.py:203-225 | submit_review 读-改-写跨事务，双提交产生错误 SM-2 状态 | 单 SQL 基于行值计算或 BEGIN IMMEDIATE |
| 7 | services/audio_service.py:149（受害方 dictionary.py:46-52、words.py:94） | TTS 兜底 30s TimeoutError 未捕获向上传播；gather 无 return_exceptions → 音频子任务异常吞掉整个词典/单词响应 500 | _run_tts_download 捕 TimeoutError 返回 False；gather 容错 |
| 8 | routers/attachments.py:40-43 | 先整读后限长，2GB 上传先撑爆内存才被拒 | 流式分块累计读超限中断 |
| 9 | routers/import_words.py:82（utils/import_utils.py:21-24） | CSV 含 NUL 或字段超 128KB 触发 csv.Error 未处理 → 500 | 捕 csv.Error 转 400 |
| 10 | routers/words.py:123 | status=review（文档有、repo 未实现）静默变"不过滤"返回全量 | 未知值 422 或空集 |
| 11 | routers/ai.py:42-54,228 | env 配置 AI_PROVIDER=ollama 且前端未带头时误扣本地零成本对话免费额度 | 判定并入 env 缺省 provider |

### 后端服务层（10）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 12 | services/multi_dict_service.py:196,216,171 | 缓存对象原样共享被调用方原地污染 → 30 分钟内同词后续请求拿到脏条目，与 DB 层缓存不一致 | 存取 deepcopy |
| 13 | services/dict_service.py:21-42 | 模块级 _dict_cache 无锁，TTL 过期分支 del/popitem 与索引并发 → KeyError 500 | threading.Lock 或 try/except KeyError |
| 14 | services/ai_service.py:311-313,984-987 | 流式失败的错误文案累积进 full_response 并写入长期记忆，未来召回可能注入报错文本 | 错误事件不计入 full_response |
| 15 | services/ai_service.py:255-267,1104-1123 | anthropic 分支无 try/raise_for_status，content 空列表 `[0]` IndexError；test_connection 固定 /chat/completions 对 anthropic 恒失败 | 补齐 openai 同款处理；test_connection 按 provider 分流 |
| 16 | services/evermem_config.py:37-38 | 配置非原子写（崩溃留半截 JSON 静默按 disabled 处理）+ 每次 chat 全量重读解析 | temp+os.replace；按 mtime 缓存 |
| 17 | services/evermem_config.py:93,131 | loop.create_task 无强引用可被 GC → timezone/注册静默丢失 | 存模块级集合 + done callback discard |
| 18 | services/evermem_service.py:932-937 | presign 解析 except 元组漏 AttributeError（objectSignedInfo:null 时 signed_info.get 抛） | 改捕 Exception 或 isinstance 预判 |
| 19 | services/multi_dict_service.py:34,51,471-485 | 上游挂起时共享 3 线程池被占满（cancel 对运行中 future 无效，retries=2 最坏 ~30s）→ 后续查询排队空转持续降级 | 缩 retries / fan-out 独立上限 |
| 20 | services/multi_dict_service.py:63-85 | get_db_manager 单例并发首建竞态 → 并发跑迁移/实例泄漏 | 双检锁 |
| 21 | services/multi_dict_service.py:233,320,383 + dict_service.py:146 | 词项未经字符集校验直接拼上游 URL，`?#&` 破坏查询语义偶发失败难排查 | 入口正则校验或 quote() |

### 后端数据层（10）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 22 | repositories/reviews_repo.py:36-49 | update_review_status 多语句写无 try/rollback（近死代码，database.py:474 委托） | 补 rollback 或删除死方法 |
| 23 | repositories/reviews_repo.py:301-315 | log_study_session check-then-act + 吞错不回滚 → 当天首条并发时学习时长静默丢失 | INSERT ON CONFLICT(date) DO UPDATE 原子累加 |
| 24 | repositories/words_repo.py:313-327 | 类内两个同名 def delete，前者空壳残留 | 删死定义 |
| 25 | repositories/words_repo.py:307-311 + routers/words.py:230-233 | update() 把 DB 错误吞成 False 与"不存在"不可区分，router 不看返回值照报成功 → 编辑静默丢失 | 异常 raise；router 检查返回值 |
| 26 | models/database.py:407-452 | migrate_from_json 吞错不回滚（损坏 JSON → 空词库无提示启动），且跑在 orphan-bump 之后要等下次重启 | 失败 rollback+显式告警；调整顺序或导入后复用 bump |
| 27 | models/database.py:361-367 | reviewed_at 回填把本地日期按 UTC 解释，东八区历史早 8 小时与新记录混排错位 | 回填加本地 UTC offset |
| 28 | repositories/words_repo.py:70,86,104,352;reviews_repo.py:120;translations_repo.py:35,48 | 共享线程本地连接上永久改 row_factory 不恢复 → review history 接口响应形状随调度漂移（前端暂未消费） | cursor 级设置或仿 chat_repo 保存/恢复 |
| 29 | models/database.py:254-264 + translations_repo.py:37-42 | translations 表缺 source_text 索引，翻译缓存查询全表扫描线性劣化 | CREATE INDEX (source_text, source_lang, target_lang) |
| 30 | repositories/chat_repo.py:50-96（database.py:384 每次启动调） | migrate_legacy 每次冷启动全表无条件 UPDATE 写放大 | 加一次性标记跳过 |
| 31 | repositories/families_repo.py:31-44 | add_batch 循环插入失败吞错不回滚，前 k-1 条延后被无关 commit 提交 | 失败先 rollback |

### cloud_server（11）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 32 | routers.py:674-678 | admin 置 PENDING 走 ORM 读改写，可冲掉并发迟到回调刚写的 SUCCESS（守卫读旧值） | 条件 UPDATE `status != ORDER_SUCCESS` |
| 33 | routers.py:434-435,341-349 | 未知 out_trade_no 静默回 success（无日志告警）+ 订单在 precreate 成功后才落库 → commit 失败则付款即丢失 | 未知订单记 error+告警；先落库再 precreate |
| 34 | routers.py:139 | 登录限流键含邮箱，单 IP 对 1000 账号各试 9 次永不 429 | 增加纯 IP 全局桶 |
| 35 | routers.py:355,360 | 支付错误把 Alipay 原始响应/异常细节回给客户端（泄漏网关信息） | 固定文案，原始内容仅日志 |
| 36 | routers.py:228-232 | license 天数按发货时可变配置反查，默认兜底 30 天（关测试开关后 1 分钱订单=30 天会员） | 下单时快照 license_days 进 Order |
| 37 | routers.py:121,142,96 | 邮箱大小写不归一：A@X.com 注册后 a@x.com 登录 401，且可注册两个大小写变体账号 | 统一 strip().lower() + 存量归一 |
| 38 | schemas.py:18 + routers.py:120 | 密码无策略：空串可注册；bcrypt >72 字节静默截断 | min_length=8, max_length=72 |
| 39 | routers.py:422 | notify 的 app_id 校验条件式，缺失即跳过归属校验 | 缺失或不匹配一律 fail |
| 40 | routers.py:96-100,142 + models.py:15 | is_active 从未被校验 → 封禁用户已签发的 30 天 token 照常工作，无吊销手段 | login/get_current_user 过滤 is_active |
| 41 | routers.py:568 + models.py:20 | 非 UTC aware datetime 写库偏移被静默丢弃（实测 +08:00 变 UTC 提前 8 小时到期） | 入库前 astimezone(utc) 或拒绝非 UTC |
| 42 | routers.py:363-370 | precreate/native 无用户级限流 → 高频调用占满支付线程池 + 刷无限 PENDING 行 | 固定窗口限流 |

### 前端 pages（8）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 43 | pages/AdminPanel.tsx:286-296,122-136 | 搜索防抖闭包过期：定时器持有旧 render 的闭包，永远少最后一个字符（"alice" 按 "alic" 查询） | useDebouncedCallback（utils/performance.ts 已有 ref 版）或 ref 取最新值 |
| 44 | pages/Review.tsx:445-447 | **已知候选确认未修**：checkSpelling 800ms 自动翻面定时器无清理，二次回车+立即评分后迟到翻面剧透下一张 | 定时器存 ref，resetInteractionState/卸载/currentWord 变化时 clear |
| 45 | pages/AIChat.tsx:793-820 | 403 premium 分支的 throw 被自己同层 catch 吞掉 → 助手气泡显示原始 JSON 并入库同步 | 设标志赋值 detailedMessage，不在 try 内 throw |
| 46 | pages/AIChat.tsx:590-599 | deleteSession 在 setState updater 内做副作用，StrictMode 下双调 updater 建两个空白会话 | updater 外做 setActiveSessionId/createNewSession |
| 47 | pages/Review.tsx:354-358,410-413 | 评分乐观追加 sessionRatings 失败不回滚 → 重试成功后 summary 该词两条、时长虚高 | 成功后再追加或 catch 移除 |
| 48 | pages/AIChat.tsx:902-909（同 Review.tsx:172-178） | 流式读取无超时/取消，半开连接挂起 reader.read() 永不返回 → loading 恒 true 页面锁死（keep-alive 下只能重启） | 空闲心跳超时 reader.cancel()；卸载 cancel |
| 49 | pages/AIChat.tsx:383-426 | 并发附件批次各自读到同一份旧 pendingAttachments → 实际数量绕过 MAX_ATTACHMENTS | 函数式更新内截断或 ref 计数 |
| 50 | pages/AddWord.tsx:84-87,145 | handleSearch 重置漏 aiError → 上一词的"生成失败"残留显示在新词条下 | 重置区补 setAiError('') |

### 前端组件 + utils（9）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 51 | components/WordDetailModal.tsx:54-74 | 切换单词 wordFamily 不重置 → 显示上一个词的词族（B fetch 失败则永久错配） | effect 开头 setWordFamily(null) |
| 52 | components/WordDetailModal.tsx:93-101,408 | Esc 关闭弹窗不触发 blur → 未保存笔记草稿静默丢弃 | onClose 前保存或确认 |
| 53 | components/DictionaryPopup.tsx:224-233 | 50ms 内开关弹窗 cleanup 先于 setTimeout 且未 clear → 每次快速开关泄漏一对 document 监听器 | timer id 存 ref cleanup clearTimeout |
| 54 | components/SelectionActionBar.tsx:88-90,185 | suppressNextSelectionSyncRef 吞掉下一次正常选区，操作条不出现需重选一次 | 限定时间窗/同一交互内消费 |
| 55 | components/AudioButton.tsx:154-181 | 音频加载无超时，挂起时 isLoading 恒 true 按钮永久假死 | setTimeout 兜底走下一发音源 |
| 56 | components/MemoryManagementModal.tsx:66-106 | 类型/翻页快速切换响应乱序覆盖（profile 慢响应覆盖 foresight 列表） | seq/abort 守卫 |
| 57 | components/QuickLookupPopup.tsx:227 | SSE data 行 JSON.parse 无容错 → 任一坏行中断整个流，部分结果被整体替换成"生成失败" | 单行 parse 包 try/catch 跳过 |
| 58 | components/review/ChoiceMode.tsx:21（同 SessionSummary.tsx:275） | 导入 JSON 含 `"meaning":null` 时选择题 word.meaning.split 抛 TypeError，ErrorBoundary 重试再崩死循环 | `(word.meaning ?? '')` 兜底 |
| 59 | components/DictionaryPopup.tsx:236-242 | 加词请求无 seq 守卫 → 点"+"后立刻查新词，旧 POST 返回 setIsSaved(true)，新词误显示"已在词库" | 保存路径比对 fetchSeqRef |

### Electron / 构建 / 部署脚本（8）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 60 | build.bat:20-26,46 | venv 创建/激活/pip 安装失败不中止 → 污染全局解释器、错误版本打包；venv-build 跨次复用依赖陈旧 | 每步后 `if %errorlevel% neq 0 exit /b` |
| 61 | electron/main.js:702-725 | whenReady 初始化链无隔离：createWindow→createTray→createApplicationMenu→startBackend 顺序执行，托盘创建抛错（createEmpty Tray 部分平台即抛）→ 后端永不启动无任何报错 | 各步骤独立 try/catch；startBackend 提前/独立 |
| 62 | electron/main.js:747（同 169,306,381-408） | 更新事件/托盘/context-menu 回调缺 isDestroyed 守卫 → 窗口销毁后访问 webContents 抛异常 | 统一加 !isDestroyed() |
| 63 | electron/preload.js:40 | backend-status 广播无前端消费者 → "UI 反应后端挂死"承诺实际到不了界面 | 前端补监听展示，或删通道 |
| 64 | electron/main.js:806-838 | 全部 IPC handle 不校验 event.sender → 渲染进程被注入即可 invoke install-update/改全局配置 | 每个 handle 校验 sender === mainWindow.webContents |
| 65 | build.bat:44-52 + electron/scripts/verify-release.mjs:70-89 | 发布守卫未接入构建链（build.bat 从不跑 release:check）；verify 只查存在性：不比对源 dist↔包内副本哈希、不校验 latest.yml 一致性（现仓 yml 写 setup-2.0.0.exe 而实际文件名是中文名，无人报警） | build.bat 尾部追加 release:check；verify 增哈希/yml 校验 |
| 66 | deploy_cloud_server.bat:28-39 | 打包阶段 copy/xcopy 失败不中止，tar 照常 → 远端才发现缺文件白跑部署 | 关键 copy 后查 errorlevel |
| 67 | electron/main.js:241,247 | frontendLoadRetries 成功后不复位 → 会话内耗尽配额后再遇真实加载失败直接进错误页不再恢复 | ready-to-show/did-finish-load 时清零 |

---

## i18n 对称性附录

**en 缺失（zh 有，共 6 个）**：
- `chat.sidebar.searchPlaceholder`（ChatSidebar.tsx:124 有 inline 默认值兜底）
- `chat.sidebar.groups.today/yesterday/previous7Days/previous30Days/older` —— ChatSidebar.tsx:137 **无 fallback，英文界面渲染 raw key**（对应上面 P2-10 同文件的另一处问题）

zh 缺失（en 有）：无。空值：两语言均 0。

**反向问题（代码引用但两语言都没有、仅靠 inline 默认值 → 语言恒定不随切换，中英混排）**：
`statistics.cards.new`、`statistics.weeklyTrendsTitle`、`statistics.noTrendData`、`statistics.masteryDistributionTitle`、`statistics.wordsUnit`（英文硬编码，StatisticsPage.tsx:119,171,201,210,253）；`review.aiCompleteFailed/aiCompleteSuccess/meaningUpdated`（中文硬编码，Review.tsx:162,184,188,203）；`chat.memory.dueToday/difficultWords`（ChatMessages.tsx:79,85）；`common.cancel`（MemoryManagementModal.tsx:387）、`common.days`（WordDetailModal.tsx:270）、`settings.account.comingSoon/cloudSyncPendingDesc`（AccountSection.tsx:131,135）。

## 死代码备注

- `repositories/limits_repo.py` 整个文件无生产调用方（limit_service 用自己的内联 SQL）——修 P2-1 时一并处理。
- `frontend/src/components/Header.tsx` 与 `pay/PaymentModal.tsx` 无人引用（PaymentModal 内还有未加固的轮询），可删。

## 干净区域（本轮确认无需动作）

SQL 注入面（前后端全参数化/ORM）、nginx 白名单与外链防护、preload 暴露面、单实例锁/退避重启/树杀、notify 发货幂等与 CAS、限流器 sweep/硬顶、AudioPool LRU、ToastContext confirmDialog、AuthContext 主链路、errorMessages/dictionaryErrors、i18n 配置本体、words_repo 排序白名单、JSON 字段防御、连接生命周期与 shutdown 链。
