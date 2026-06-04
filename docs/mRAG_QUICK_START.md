# mRAG 集成快速启动指南

> 本文档是给 Qoder CLI 新会话读的"启动入口"。在新会话中粘贴下面一句话即可开始实施。

## 一句话启动指令（复制到新会话）

```
请按 docs/mRAG_INTEGRATION_PLAN.md 规划，从 P1 阶段开始实施 Evermind mRAG 消费端接入。
范围：图片 + PDF 双写到 LLM + Evermind 长期记忆。
严格对齐官方 v1 规范（POST /api/v1/object/sign + ContentItem 数组 + uri = objectKey）。
```

## 文件导航

| 文档 | 用途 |
|---|---|
| `docs/mRAG_INTEGRATION_PLAN.md` | **完整规划**（7 章节、6 文件变更清单、实施顺序、验证用例） |
| `docs/EVERMEM_ALIGNMENT_NOTES.md`（根目录） | 历史踩坑记录，重点看第 2 条 flush 坑 |
| `backend/services/evermem_service.py` | 核心服务层，已有 `upload_multimodal_data` 待扩展 |
| `backend/services/ai_service.py` | 3 处 `add_memory` 调用点（1160/1410/1524） |
| `backend/routers/ai.py` | chat_stream 路由（303-430 行） |
| `frontend/src/pages/AIChat.tsx` | 已有完整图片上传 UX，需扩展 PDF |
| `frontend/src/i18n/locales/{en,zh}/translation.json` | i18n 词条扩展点 |

## 核心约束（别让 AI 乱发挥）

1. **不要**在 `ChatMessage.content` 上做文章 —— 在顶层 `ChatRequest` 加 `attachments` 字段
2. **不要**改 `upload_multimodal_data` 的返回值结构 —— 它返回原始 JSON，需要手动解包 `resp["result"]["data"]["objectList"][0]`
3. **不要**删现有 i18n 词条（`onlyImages`/`maxImages` 等），只新增
4. **保持** `add_memory` 的 `attachments=None` 默认值，5 个老调用点零改动
5. **用** `attachments` 时强制 `flush=True`（用户传 PDF 后切会话能立刻召回）

## 验证命令速查

```bash
# 后端测试
pytest backend/tests/test_evermem_extended.py -v

# 直调 presign 接口（后端起好后）
curl -X POST http://localhost:8000/api/attachments/presign \
  -F "file=@test.pdf" \
  -H "Authorization: Bearer <token>"

# 前端 dev
cd frontend && npm run dev

# 类型检查
cd frontend && npx tsc --noEmit

# 后端启动
cd backend && uvicorn main:app --reload --port 8000
```

## 实施顺序

P1（后端半天）→ P2（集成 1h）→ P3（前端半天）→ P4（召回验证 1h）→ P5（收尾）

详细步骤看 `mRAG_INTEGRATION_PLAN.md` 第 5 节。
