"""
Batch Import API Router
批量导入单词
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from datetime import datetime
from services.blocking_io import run_db_blocking, run_io_blocking
from utils.import_utils import parse_txt_content, parse_csv_content
import csv
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class ImportResult(BaseModel):
    """导入结果"""
    total: int
    success: int
    failed: int
    skipped: int
    details: List[dict]


class ImportWordsRequest(BaseModel):
    """直接导入单词列表"""
    words: List[str]
    auto_lookup: bool = True
    tag: str = ""


def get_db():
    """获取数据库实例"""
    from utils.db import get_db as _get_db
    return _get_db()


def lookup_word(word: str) -> Optional[dict]:
    """查询词典获取单词信息"""
    try:
        from services.dict_service import DictService
        result = DictService.search_word(word, sources=["youdao"])
        return result
    except Exception as e:
        logger.error(f"Lookup failed for '{word}': {e}")
        return None


@router.post("/upload", response_model=ImportResult)
async def import_from_file(
    file: UploadFile = File(...),
    auto_lookup: bool = True,
    tag: str = ""
):
    """
    从TXT/CSV文件批量导入单词
    - TXT: 每行一个单词
    - CSV: word,meaning,phonetic (meaning和phonetic可选)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # 检查文件类型
    filename = file.filename.lower()
    if not (filename.endswith('.txt') or filename.endswith('.csv')):
        raise HTTPException(status_code=400, detail="Only .txt and .csv files are supported")
    
    # 读取文件内容
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = content.decode('gbk')
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to decode file. Use UTF-8 or GBK encoding.")
    
    # 解析文件
    if filename.endswith('.csv'):
        try:
            entries = parse_csv_content(text)
        except csv.Error as e:
            # Malformed input (NUL bytes, oversized fields, bad quoting) is a
            # client error, not a server failure.
            raise HTTPException(status_code=400, detail=f"Invalid CSV file: {e}")
    else:
        words = parse_txt_content(text)
        entries = [{"word": w} for w in words]
    
    if not entries:
        raise HTTPException(status_code=400, detail="No words found in file")
    
    # 批量处理
    return await process_import(entries, auto_lookup, tag)


@router.post("/words", response_model=ImportResult)
async def import_word_list(request: ImportWordsRequest):
    """直接导入单词列表"""
    if not request.words:
        raise HTTPException(status_code=400, detail="No words provided")
    
    entries = [{"word": w} for w in request.words if w.strip()]
    return await process_import(entries, request.auto_lookup, request.tag)


async def process_import(entries: List[dict], auto_lookup: bool, tag: str) -> ImportResult:
    """处理导入逻辑（批量优化版）。

    与旧实现的差异：
    - 一次批量查重（而不是逐词 get_word）
    - 词典查询 / 音频下载并发执行（复用 blocking_io 的共享 executor）
    - 单词插入用单个事务 executemany
    结果语义（success/failed/skipped）保持不变。
    """
    db = get_db()

    results = {
        "total": len(entries),
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "details": []
    }

    # 1. 规范化 + 批内去重（后续重复项按 "skipped" 计，与旧实现行为一致）
    seen: set[str] = set()
    pending: List[dict] = []
    for entry in entries:
        word = (entry.get("word") or "").strip()
        if not word:
            continue
        if word in seen:
            results["skipped"] += 1
            results["details"].append({"word": word, "status": "skipped", "reason": "duplicate in batch"})
            continue
        seen.add(word)
        pending.append({
            "word": word,
            "phonetic": entry.get("phonetic", ""),
            "meaning": entry.get("meaning", ""),
            "example": entry.get("example", ""),
        })

    if not pending:
        return ImportResult(**results)

    # 2. 批量查重（一次 IN 查询）
    existing_words = set(await run_db_blocking(db.get_existing_words, [p["word"] for p in pending]))
    new_entries: List[dict] = []
    for p in pending:
        if p["word"] in existing_words:
            results["skipped"] += 1
            results["details"].append({"word": p["word"], "status": "skipped", "reason": "already exists"})
        else:
            new_entries.append(p)

    if not new_entries:
        return ImportResult(**results)

    # 3. 并发查词典（无释义的词）
    enriched: List[dict] = new_entries
    if auto_lookup:
        import asyncio

        lookup_sem = asyncio.Semaphore(4)

        async def _enrich(p: dict) -> dict:
            """Per-word lookup; failures leave the entry unchanged (word gets 'no meaning found')."""
            try:
                if (p.get("meaning") or "").strip():
                    return p
                async with lookup_sem:
                    lookup_result = await run_io_blocking(lookup_word, p["word"])
                if lookup_result and not lookup_result.get("error"):
                    if not p.get("phonetic"):
                        p["phonetic"] = lookup_result.get("phonetic", "")
                    if not p.get("meaning"):
                        p["meaning"] = lookup_result.get("meaning", "")
                    if not p.get("example"):
                        p["example"] = lookup_result.get("example", "")
            except Exception as exc:
                logger.error(f"Lookup failed for '{p['word']}': {exc}")
            return p

        enriched = list(await asyncio.gather(*(_enrich(p) for p in new_entries)))

    # 4. 并发下载音频并组装行
    import asyncio
    from services.audio_service import AudioService

    audio_sem = asyncio.Semaphore(3)

    async def _build_row(p: dict):
        """Per-word row build; on error returns (word, None, reason) so the word is reported failed."""
        try:
            meaning = (p.get("meaning") or "").strip()
            if not meaning:
                return p, None, None
            async with audio_sem:
                audio_path = await run_io_blocking(AudioService.ensure_audio, p["word"])
            return p, {
                "word": p["word"],
                "phonetic": p.get("phonetic", ""),
                "meaning": meaning,
                "example": p.get("example", ""),
                "context_en": "",
                "context_cn": "",
                "tags": tag,
                "roots": "",
                "synonyms": "",
                "audio": audio_path or "",
                "date": datetime.now().strftime('%Y-%m-%d'),
            }, None
        except Exception as exc:
            logger.error(f"Audio/row build failed for '{p['word']}': {exc}")
            return p, None, str(exc)

    built = await asyncio.gather(*(_build_row(p) for p in enriched))
    rows = []
    for p, row, error in built:
        if row is None:
            results["failed"] += 1
            results["details"].append({
                "word": p["word"],
                "status": "failed",
                "reason": error or "no meaning found",
            })
        else:
            rows.append(row)

    def _append_success(row: dict) -> None:
        results["success"] += 1
        meaning = row["meaning"]
        results["details"].append({
            "word": row["word"],
            "status": "success",
            "meaning": meaning[:50] + "..." if len(meaning) > 50 else meaning,
        })

    # 5. 单个事务批量插入 + 按库内存在情况判定结果
    if rows:
        try:
            await run_db_blocking(db.add_words_batch, rows)
        except Exception as e:
            # 批量失败（极少见，例如磁盘/锁错误）：回退到逐词插入，好词照常成功
            logger.error(f"Batch insert failed, falling back to per-word inserts: {e}")
            for row in rows:
                try:
                    ok = await run_db_blocking(db.add_word, row)
                    if ok:
                        _append_success(row)
                    else:
                        results["failed"] += 1
                        results["details"].append({
                            "word": row["word"],
                            "status": "failed",
                            "reason": "already exists",
                        })
                except Exception as exc:
                    results["failed"] += 1
                    results["details"].append({"word": row["word"], "status": "failed", "reason": str(exc)})
            return ImportResult(**results)

        present = set(await run_db_blocking(db.get_existing_words, [r["word"] for r in rows]))
        for row in rows:
            if row["word"] in present:
                _append_success(row)
            else:
                results["failed"] += 1
                results["details"].append({
                    "word": row["word"],
                    "status": "failed",
                    "reason": "insert failed",
                })

    return ImportResult(**results)
