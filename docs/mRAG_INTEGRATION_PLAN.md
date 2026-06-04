# vocabbook-modern · Evermind mRAG 消费端接入规划

## Context（为什么做这个改动）

`D:\Projects\vocabbook-modern` 已经对接了 Evermind v1 API 做聊天长期记忆，但只覆盖了纯文本路径。Evermind 在 **2026-04-08 的 v0.2.0** 开放了 **mRAG 多模态记忆**（图片 / PDF / 文档与文本一起被切片索引、跨会话检索），本地 `backend/services/evermem_service.py:746` 虽然有 `upload_multimodal_data` 函数，但**没有任何调用方**，AI Chat 上传的图片也只作为当前会话的 LLM 视觉输入，**不会写入长期记忆**。

本规划目标：**把图片 + PDF 上传链路打通，让附件同时服务于当前 LLM 视觉 + Evermind 长期记忆**，使产品具备"拍照/传 PDF 直接学单词"的能力，拉开与竞品差距。

**范围（已与用户确认）**：
- MVP 文件类型：**图片（JPG/PNG/GIF/WebP）+ PDF**，不含 .docx/.txt/.html
- **双写**：附件既发给当前 LLM，也写入 Evermind 长期记忆

**强约束**：必须严格对齐 Evermind 官方 v1 规范（`POST /api/v1/object/sign`、`ContentItem` 数组、`uri = objectKey`），不能自创字段。

---

## 1. 文件变更清单（6 个文件）

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `backend/services/evermem_service.py` | 扩展 | 给 `add_memory` 加 `attachments` 参数；新增 `presign_and_upload` 编排函数 |
| `backend/routers/attachments.py` | **新增** | 单一路由 `POST /api/attachments/presign`，multipart 接收文件 → 走 Evermind S3 签名 → 返回 `objectKey` |
| `backend/main.py` | 注册 | 挂载新 `attachments` 路由 |
| `backend/services/ai_service.py` | 扩展 | 在 1410 / 1524 两处用户 turn 的 `add_memory` 调用，把前端传来的 `attachments` 透传下去 |
| `frontend/src/pages/AIChat.tsx` | 扩展 | 放宽文件类型、PDF 预览图标、发送前调 `/presign` 拿 `objectKey`、`buildMessagePayload` 输出官方格式 |
| `frontend/src/i18n/locales/{en,zh}/translation.json` | 扩展 | 在 `chat.attachments.*` 下加 PDF / 上传失败相关词条 |

---

## 2. 后端改动

### 2.1 `backend/services/evermem_service.py`

#### 2.1.1 `add_memory` 签名扩展（向后兼容）

新增可选参数 `attachments: Optional[List[Dict]] = None`，形状如下（与官方 ContentItem 对齐）：

```python
attachments = [
    {"type": "image",    "uri": "<objectKey>", "name": "whiteboard.png", "ext": "png"},
    {"type": "document", "uri": "<objectKey>", "name": "words.pdf",      "ext": "pdf"},
]
```

函数内部构造 `message` 时：

```python
if attachments:
    content_field: List[Dict] = [{"type": "text", "text": content}] if content else []
    for a in attachments:
        content_field.append({
            "type": a["type"],         # "image" | "document" | "video"
            "uri":  a["uri"],          # objectKey from sign flow
            "name": a.get("name"),
            "ext":  a.get("ext"),
        })
    message["content"] = content_field
else:
    message["content"] = content       # 保持原 str 行为，所有老调用零改动
```

**向后兼容**：`attachments=None` 时与今天完全一致，5 个现有调用点（ai_service 3 处 + review.py 2 处）无需修改即可编译运行。

#### 2.1.2 新增 `presign_and_upload` 编排函数

```python
async def presign_and_upload(
    self,
    file_bytes: bytes,
    file_name: str,
    file_type: str,       # "image" | "document" | "video"
    file_ext: str,        # "png" | "pdf" | ...
) -> Optional[Dict]:
    """
    完整编排：sign → PUT/POST S3 → 返回 objectKey。
    返回 {"objectKey": "...", "fileType": "...", "fileName": "..."} 或 None。
    """
```

实现步骤：
1. 生成 `fileId = str(uuid.uuid4())`
2. 调已有 `upload_multimodal_data([{"fileId", "fileName": file_name, "fileType": file_type, "name": file_name, "ext": file_ext}])`
3. **手动解包**：该函数返回的是原始 `{"status":0, "result":{"data":{"objectList":[{...}]}}}`（注意它没走 `_unwrap_v1_response`），需要按 `resp["result"]["data"]["objectList"][0]` 取到 `objectKey` + `objectSignedInfo{url, fields}`
4. 用 httpx 把 `file_bytes` 上传到 S3：
   - 如果 `objectSignedInfo.fields` 存在 → `POST url` 用 `multipart/form-data` 带上 fields
   - 否则 → `PUT url` 直接 binary body
5. S3 返回 2xx → 返回 `{"objectKey": ..., "fileType": file_type, "fileName": file_name}`

#### 2.1.3 官方字段对齐速查

| 我们传的字段 | 官方字段 | 来源 |
|---|---|---|
| `type` | `ContentItem.type` | docs 明确枚举 `text/image/video/document/audio/file` |
| `uri` | `ContentItem.uri` | docs: "uri | string | objectKey from upload flow" |
| `name` | `ContentItem.name` | docs: "name | string | File name" |
| `ext` | `ContentItem.ext` | docs: "ext | string | File extension (png, mp3, pdf)" |

### 2.2 新文件 `backend/routers/attachments.py`

```python
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
router = APIRouter(prefix="/api/attachments", tags=["attachments"])

ALLOWED = {
    "image/jpeg":    ("image",    "jpg", 10 * 1024 * 1024),
    "image/png":     ("image",    "png", 10 * 1024 * 1024),
    "image/gif":     ("image",    "gif", 10 * 1024 * 1024),
    "image/webp":    ("image",    "webp",10 * 1024 * 1024),
    "application/pdf":("document","pdf", 20 * 1024 * 1024),
}

@router.post("/presign")
async def presign_attachment(request: Request, file: UploadFile = File(...)):
    # 1. MIME 校验
    # 2. 读 bytes + size 校验
    # 3. 从 request.state 解析 auth，拿到 evermem_service（参考 ai.py 的 _prime_evermem_runtime）
    # 4. 调 evermem_service.presign_and_upload(bytes, file.filename, fileType, ext)
    # 5. 返回 {"objectKey","fileType","fileName","size","mediaType"}
```

**鉴权 / evermem_service 解析**：复用 `backend/routers/ai.py` 中 `_prime_evermem_runtime` 的同一套机制（读 `X-Evermem-Key` header 或从 auth token 派生），**不重造**。

### 2.3 `backend/main.py`

```python
from .routers import attachments
app.include_router(attachments.router)
```

一行注册。

### 2.4 `backend/services/ai_service.py`

#### 2.4.1 入口签名扩展

`chat(...)` / `chat_stream(...)` 方法新增可选参数：

```python
attachments: Optional[List[Dict]] = None   # 来自前端的 objectKey 列表
```

#### 2.4.2 两处用户 turn 调用点透传

`ai_service.py:1410`（chat）和 `ai_service.py:1524`（chat_stream）：

```python
save_result = await self.evermem_service.add_memory(
    content=last_user_msg_text,          # 纯文本部分
    user_id=self.evermem_user_id,
    sender=self.evermem_user_id,
    sender_name="User",
    group_id=session_id,
    group_name=session_id,
    role="user",
    attachments=attachments,             # ← 新增透传
    flush=True,                          # ← 多模态高价值数据，强制落盘（用户切会话前就绑定）
)
```

`flush=True` 是有意为之：用户上传了单词表 PDF，希望立刻成为可召回记忆，而非等到 turn 结束。与 `EVERMEM_ALIGNMENT_NOTES.md` 第 2 条 pitfall 对齐（"new turns were not being finalized"）。

#### 2.4.3 路由层传参

`backend/routers/ai.py:430` 的 `chat_stream` 把请求中的 `attachments` 字段透传给 `ai_service.chat_stream(...)`。ChatRequest 加一个可选字段：

```python
class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context_word: str = ""
    session_id: Optional[str] = None
    attachments: Optional[List[Dict]] = None   # ← 新增，每个 dict 形如 {type,uri,name,ext}
```

**注意**：不在 `ChatMessage.content` 上做文章（保持它既能 str 又能 array），而是在顶层新增 `attachments`，语义更清晰：这是"本次消息要写入长期记忆的附件"，与"发给 LLM 的视觉输入"解耦。

---

## 3. 前端改动

### 3.1 `frontend/src/pages/AIChat.tsx`

#### 3.1.1 类型扩展

```typescript
interface Attachment {
    id: string
    name: string
    dataUrl?: string       // 图片保留，用于本地预览 + LLM vision
    mediaType: string
    size: number
    // 新增（PDF 必有，图片上传后填上）
    objectKey?: string
    fileType?: 'image' | 'document'
    ext?: string
}
```

把代码里所有 `ImageAttachment` 重命名为 `Attachment`（VS Code 全局替换，约 10 处）。`pendingImages` → `pendingAttachments`。

#### 3.1.2 放宽文件输入

```tsx
<input type="file"
       accept="image/*,application/pdf"     // 从 image/* 放宽
       multiple
       onChange={handleAttachmentSelect}
       ref={fileInputRef}
       className="hidden" />
```

#### 3.1.3 `addImageFiles` → `addAttachmentFiles`

```typescript
const MAX_ATTACHMENTS = 3
const MAX_IMAGE_BYTES = 10 * 1024 * 1024   // 对齐官方 10MB
const MAX_PDF_BYTES  = 20 * 1024 * 1024   // PDF 放宽到 20MB

const addAttachmentFiles = async (files: File[]) => {
    const accepted: Attachment[] = []
    for (const file of files) {
        if (accepted.length >= MAX_ATTACHMENTS) {
            toast.error(t('chat.attachments.maxAttachments', {count: MAX_ATTACHMENTS}))
            break
        }
        const isImage = file.type.startsWith('image/')
        const isPdf   = file.type === 'application/pdf'
        if (!isImage && !isPdf) { toast.error(t('chat.attachments.unsupportedType')); continue }
        const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
        if (file.size > limit) {
            toast.error(t('chat.attachments.fileTooLarge', {name: file.name}))
            continue
        }
        const att: Attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            mediaType: file.type,
            size: file.size,
            fileType: isPdf ? 'document' : 'image',
            ext: (file.name.split('.').pop() || '').toLowerCase(),
        }
        if (isImage) {
            att.dataUrl = await readImageFile(file)    // 复用现有 base64 读取
        }
        accepted.push(att)
    }
    setPendingAttachments(prev => [...prev, ...accepted])
}
```

#### 3.1.4 发送前上传到 S3

```typescript
const presignAttachment = async (att: Attachment, file: File): Promise<Attachment> => {
    const fd = new FormData()
    fd.append('file', file, att.name)
    const res = await api.upload('/api/attachments/presign', fd)
    if (!res.ok) throw new Error('presign failed')
    const data = await res.json()
    return { ...att, objectKey: data.objectKey }
}
```

需要在 `pendingAttachments` 里**暂存原始 `File` 对象**（新增一个 `file?: File` 字段），发送时才上传。发送成功后清空。

#### 3.1.5 `buildMessagePayload` 扩展

```typescript
const buildMessagePayload = (message: Message) => {
    if (message.role !== 'user' || !message.attachments?.length) return message.content
    const parts: any[] = []
    if (message.content.trim()) parts.push({ type: 'text', text: message.content })
    for (const a of message.attachments) {
        if (a.fileType === 'image') {
            // LLM 视觉走 dataUrl（与今天一致）
            parts.push({ type: 'image_url', image_url: { url: a.dataUrl } })
        } else if (a.fileType === 'document') {
            // PDF 当前 LLM 不一定支持，给一段文件名 + 说明作为占位
            parts.push({ type: 'text', text: `[Attached PDF: ${a.name}]` })
        }
    }
    return parts.length ? parts : message.content
}
```

#### 3.1.6 PDF 预览 UI

替换 `<img>` 分支（约 1689-1707 行）：

```tsx
{att.fileType === 'image' ? (
    <img src={att.dataUrl} alt={att.name} className="block max-h-64 w-full object-cover rounded" />
) : (
    <div className="flex items-center gap-3 rounded border border-stone-300 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900">
        <FileText className="h-8 w-8 text-amber-600" />
        <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{att.name}</div>
            <div className="text-xs text-stone-500">{(att.size/1024).toFixed(0)} KB · PDF</div>
        </div>
    </div>
)}
```

`FileText` 已在 lucide-react，加到 import 即可。

#### 3.1.7 `handleSend` 流程

```typescript
const handleSend = async () => {
    // 1. 把所有 pending 附件上传 presign（并发）
    const uploaded = await Promise.all(
        pendingAttachments.map(a => presignAttachment(a, a.file!))
    )
    // 2. 构造 user message（含 attachments）
    // 3. POST /api/ai/chat/stream  body: {..., attachments: uploaded.map(...)}
    // 4. 清空 pendingAttachments
}
```

发送中显示 "📤 Uploading N files..." 占位气泡，上传失败则 toast + 中止发送。

### 3.2 i18n 词条

**`frontend/src/i18n/locales/en/translation.json`** 在 `chat.attachments` 下新增：

```json
"unsupportedType": "Only images (JPG/PNG/GIF/WebP) and PDF files are supported.",
"maxAttachments": "You can attach up to {{count}} files.",
"pdfTooLarge": "{{name}} is larger than 20 MB.",
"imageTooLarge": "{{name}} is larger than 10 MB.",
"uploading": "Uploading {{count}} file(s)...",
"uploadFailed": "Failed to upload {{name}}. Please try again.",
"attachFile": "Attach image or PDF",
"pdfHint": "PDF content will be indexed for future recall."
```

**`zh/translation.json`** 对应：

```json
"unsupportedType": "仅支持图片（JPG/PNG/GIF/WebP）和 PDF 文件。",
"maxAttachments": "最多可附加 {{count}} 个文件。",
"pdfTooLarge": "{{name}} 超过 20 MB。",
"imageTooLarge": "{{name}} 超过 10 MB。",
"uploading": "正在上传 {{count}} 个文件...",
"uploadFailed": "{{name}} 上传失败，请重试。",
"attachFile": "附加图片或 PDF",
"pdfHint": "PDF 内容将被索引，供后续会话召回。"
```

保留现有 `onlyImages`/`maxImages`/`firstImagesOnly`/`fileTooLarge`/`loadFailed`/`removeImage`/`attachImage`/`hint` 词条，**不删除**（向后兼容 + 防止其他地方引用）。

---

## 4. 风险 / 注意点

1. **`upload_multimodal_data` 不解包**：它没用 `_unwrap_v1_response`，返回的是原始 `{"status":0,"result":{"data":{"objectList":[...]}}}`。`presign_and_upload` 必须按 `resp["result"]["data"]["objectList"][0]` 取，不能套用其他方法的解包逻辑。
2. **S3 上传方式可能二选一**：官方返回 `objectSignedInfo.url` + `fields`。如果 `fields` 非空 → `POST url` 用 `multipart/form-data`（fields 里通常有 `key`, `policy`, `signature`, `AWSAccessKeyId` 等）。如果 `fields` 为空 → `PUT url` 直接 binary。**代码要同时兼容两种**，按 `fields` 是否存在分支。
3. **PDF 是否支持客户端解析**：官方文档未明确 PDF 是否需要客户端预提取文本。MVP 假定 Evermind 服务端自动切片，我们只传二进制。如果实测发现需要客户端先转文本，再加 `pypdf` 依赖（作为 v1.1 增强）。
4. **`flush=True` 对多模态写入的影响**：`_finalize_memory_turn`（1160 行）已经是 `flush=True`；现在用户 turn（1410/1524）也加 `flush=True` 是为了"用户传完 PDF 立刻换会话也能召回"。但会触发更频繁的提取任务，需观察 API 限流。
5. **并发上传**：前端 `Promise.all` 同时上传 3 个 10MB 文件，可能受浏览器连接数限制；保留 `MAX_ATTACHMENTS=3` 作为兜底。
6. **LLM 对 PDF 的理解**：当前通义 / OpenAI 视觉模型不直接吃 PDF binary，所以 `buildMessagePayload` 对 PDF 只给 `[Attached PDF: words.pdf]` 占位，真正的语义召回靠 Evermind mRAG。如果未来 LLM 原生支持 PDF，再扩展。
7. **i18n 不要删老词条**：避免其他组件引用造成回归。

---

## 5. 实施顺序（可独立验证）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1（后端，~半天）** | `evermem_service.py` 加 `presign_and_upload` + `add_memory` 附件扩展；新建 `attachments.py` 路由；`main.py` 注册 | `pytest backend/tests/test_evermem_extended.py` 全部通过；用 `curl -F file=@test.pdf` 直接打 `/api/attachments/presign` 拿到 `objectKey`；用 `httpx` 直调 `add_memory` + attachments 验证 Evermind 后台出现带附件的记忆 |
| **P2（集成，~1小时）** | `ai_service.py` 两处 user turn 透传 `attachments`；`routers/ai.py` 加 `attachments` 字段；`_prime_evermem_runtime` 复用 | 本地起服务，用 Postman 发 `{messages, attachments:[{type,uri,name,ext}]}` 验证后端不报错且 Evermind 出现记忆 |
| **P3（前端，~半天）** | 类型重命名、accept 放宽、PDF 预览、presign 上传、buildMessagePayload、handleSend 串联、i18n 词条 | 本地 `npm run dev`，在 AI Chat 里上传图片 / PDF，看预览、看发送、看 LLM 响应、看 Evermind dashboard |
| **P4（召回验证，~1小时）** | 跨会话召回测试 | 会话 A 上传四六级 PDF → 会话 B 问 "我上传的词汇表里 abandon 怎么拼" → AI 能基于 PDF 内容回答 |
| **P5（收尾）** | 加一个 `docs/mRAG_INTEGRATION.md` 记录对齐要点、跑一轮 `npm run lint`、`pytest`、`tsc --noEmit` | CI 通过 |

---

## 6. 端到端验证用例

### 6.1 图片（视觉 + 记忆）
1. 截图一张单词表（约 20 个词）
2. 在 AI Chat 粘贴图片 + 输入"帮我整理这些单词"
3. 期望：当前会话 LLM 看图给出单词列表（视觉 OK）
4. 关闭会话，**新开一个会话**，问 "刚才那张单词表里第 5 个词是什么"
5. 期望：AI 通过 Evermind 召回图片内容，正确回答

### 6.2 PDF（记忆为主）
1. 准备一份 2 页四六级词汇 PDF
2. 拖入 AI Chat + 输入"这是我本周要背的词汇表"
3. 期望：PDF 预览图标显示；AI 回复"已收到，我会记住这些词汇"
4. 新开一个会话，问 "我的词汇表里有哪些以 'ab' 开头的单词"
5. 期望：AI 通过 mRAG 召回 PDF 切片，列出相关词

### 6.3 错误路径
- 上传 `.exe` 文件 → toast "仅支持图片和 PDF"
- 上传 25MB PDF → toast "超过 20 MB"
- 上传 15MB 图片 → toast "超过 10 MB"
- Evermind API Key 无效 → 后端返回 401，前端 toast "上传失败"
- 上传中途断网 → 30s 超时，前端中止发送

### 6.4 回归
- 纯文本消息：照常工作，无 `attachments` 字段
- 仅图片消息（无 PDF）：与今天行为一致
- `review.py` 的两处 `add_memory`（314/385 行）：未传 attachments，零影响

---

## 7. 不在本期范围

- `.docx` / `.txt` / `.html` / 视频 / 音频（留作 v1.1）
- 搜索结果 `include_original_data` 回传二进制（文本切片足够）
- 客户端 PDF 文本提取（pypdf）— 先验证 Evermind 服务端切片效果
- 附件管理 / 删除（ Evermind `delete_memories` 的附件粒度控制）
- 多附件打包成一个 MemCell 的合并策略
