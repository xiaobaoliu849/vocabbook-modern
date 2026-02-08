"""
 Batch Import API Router
 批量导入单词
 """
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
import csv
import io
from datetime import datetime

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
    from main import get_db as main_get_db
    return main_get_db()


def lookup_word(word: str) -> Optional[dict]:
    """查询词典获取单词信息"""
    try:
        from services.dict_service import DictService
        result = DictService.search_word(word, sources=["youdao"])
        return result
    except Exception as e:
        print(f"Lookup failed for '{word}': {e}")
        return None


def parse_txt_content(content: str) -> List[str]:
    """解析TXT内容，每行一个单词"""
    lines = content.strip().split('\n')
    words = []
    for line in lines:
        word = line.strip()
        # 跳过空行和注释
        if word and not word.startswith('#'):
            # 如果有逗号，取第一部分作为单词
            if ',' in word:
                word = word.split(',')[0].strip()
            words.append(word)
    return words


def parse_csv_content(content: str) -> List[dict]:
    """解析CSV内容，支持 word,meaning 格式"""
    reader = csv.reader(io.StringIO(content))
    results = []
    for row in reader:
        if not row or not row[0].strip():
            continue
        word = row[0].strip()
        if word.startswith('#'):
            continue
        entry = {"word": word}
        if len(row) > 1 and row[1].strip():
            entry["meaning"] = row[1].strip()
        if len(row) > 2 and row[2].strip():
            entry["phonetic"] = row[2].strip()
        results.append(entry)
    return results


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
        except:
            raise HTTPException(status_code=400, detail="Unable to decode file. Use UTF-8 or GBK encoding.")
    
    # 解析文件
    if filename.endswith('.csv'):
        entries = parse_csv_content(text)
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
    
    entries = [{"word": w.strip()} for w in request.words if w.strip()]
    return await process_import(entries, request.auto_lookup, request.tag)


async def process_import(entries: List[dict], auto_lookup: bool, tag: str) -> ImportResult:
    """处理导入逻辑"""
    db = get_db()
    
    results = {
        "total": len(entries),
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "details": []
    }
    
    for entry in entries:
        word = entry["word"]
        
        # 检查是否已存在
        existing = db.get_word(word)
        if existing:
            results["skipped"] += 1
            results["details"].append({
                "word": word,
                "status": "skipped",
                "reason": "already exists"
            })
            continue
        
        # 准备单词数据
        word_data = {
            "word": word,
            "phonetic": entry.get("phonetic", ""),
            "meaning": entry.get("meaning", ""),
            "example": "",
            "context_en": "",
            "context_cn": "",
            "tags": tag,
            "roots": "",
            "synonyms": "",
            "date": datetime.now().strftime('%Y-%m-%d')
        }
        
        # 自动查词典
        if auto_lookup and not word_data["meaning"]:
            lookup_result = lookup_word(word)
            if lookup_result and not lookup_result.get("error"):
                word_data["phonetic"] = lookup_result.get("phonetic", "")
                word_data["meaning"] = lookup_result.get("meaning", "")
                word_data["example"] = lookup_result.get("example", "")
        
        # 保存到数据库
        try:
            if word_data["meaning"]:  # 只有有释义才保存
                db.add_word(word_data)
                results["success"] += 1
                results["details"].append({
                    "word": word,
                    "status": "success",
                    "meaning": word_data["meaning"][:50] + "..." if len(word_data["meaning"]) > 50 else word_data["meaning"]
                })
            else:
                results["failed"] += 1
                results["details"].append({
                    "word": word,
                    "status": "failed",
                    "reason": "no meaning found"
                })
        except Exception as e:
            results["failed"] += 1
            results["details"].append({
                "word": word,
                "status": "failed",
                "reason": str(e)
            })
    
    return ImportResult(**results)
