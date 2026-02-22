"""
TTS Router - 文本转语音播放
支持 Edge-TTS 生成高质量英文语音
"""
import os
import asyncio
import hashlib
import re
from fastapi import APIRouter
from fastapi.responses import FileResponse, StreamingResponse
from fastapi import HTTPException
import edge_tts

router = APIRouter()

# 配置
VOICE = "en-US-JennyNeural"  # 标准英文女声
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_audio")
RATE = "+0%"  # 正常语速

# 临时目录
TEMP_DIR = os.path.dirname(os.path.dirname(__file__))

def ensure_output_dir():
    """确保音频输出目录存在"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

def clean_text_for_tts(text: str) -> str:
    """
    清理文本以便TTS处理：
    1. 提取英文字符
    2. 去除多余换行
    3. 限制长度 (放大至适用长对话)
    """
    if not text:
        return ""
    
    # 先去除首尾空白
    text = text.strip()
    
    # 移除 bullet point 和 markdown 符号
    text = re.sub(r'^[•\-\*]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*+', '', text)  # remove bold/italic marks
    text = re.sub(r'_+', '', text)   # remove underline/italic marks
    text = re.sub(r'#+\s*', '', text) # remove heading marks
    
    # 移除 Emoji 和特殊符号 (覆盖常见 emoji 和符号区块)
    # Miscellaneous Symbols and Pictographs, Emoticons, Transport and Map Symbols, etc.
    text = re.sub(r'[\U0001f600-\U0001f64f]', '', text) # Emoticons
    text = re.sub(r'[\U0001f300-\U0001f5ff]', '', text) # Misc Symbols and Pictographs
    text = re.sub(r'[\U0001f680-\U0001f6ff]', '', text) # Transport and Map
    text = re.sub(r'[\u2600-\u26ff]', '', text)         # Misc symbols (like ⚠️, ☀️)
    text = re.sub(r'[\u2700-\u27bf]', '', text)         # Dingbats (like ✅, ✏️)
    text = re.sub(r'[\U0001fa70-\U0001faff]', '', text) # Symbols and Pictographs Extended-A
    text = re.sub(r'[\U0001f900-\U0001f9ff]', '', text) # Supplemental Symbols and Pictographs
    text = re.sub(r'💡|🌟|😊|✅|⚠️|⭐|✨|🎯|📚|📝|🎉|👍', '', text) # 额外写死一些常见的高频 emoji 保底
    
    # 策略：只保留连续英文句子（至少2个单词）
    english_sentences = []
    lines = text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # 如果行主要是中文字符（中文字符占比>30%），跳过该行
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', line))
        total_chars = len(line)
        if total_chars > 0 and (chinese_chars / total_chars) > 0.3:
            continue
        
        # 移除剩余的少量中文
        line = re.sub(r'[\u4e00-\u9fff]', '', line)
        
        # 清理多余空格
        line = ' '.join(line.split())
        
        # 如果清理后还有内容，保留
        if len(line.split()) >= 2:  # 至少2个单词才算一句话
            english_sentences.append(line)
    
    # 合并所有英文句子
    result = ' '.join(english_sentences)
    
    # 最终清理多余空格
    result = re.sub(r'\s+', ' ', result)
    result = result.strip()
    
    # 限制长度（放宽至 4000 个字符）
    if len(result) > 4000:
        result = result[:4000].rsplit(' ', 1)[0] + '.'
    
    return result

def get_audio_filename(text: str) -> str:
    """根据文本生成唯一的文件名"""
    text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()[:12]
    return f"{text_hash}.mp3"

@router.get("/speak")
async def text_to_speech(text: str):
    """
    将文本转换为语音并返回音频文件
    如果已存在则直接返回缓存文件
    """
    try:
        ensure_output_dir()
        
        # 清理文本
        cleaned_text = clean_text_for_tts(text)
        
        print(f"[TTS] Original text length: {len(text)}")
        print(f"[TTS] Cleaned text: {cleaned_text[:100]}...")
        
        if not cleaned_text:
            raise HTTPException(status_code=400, detail="No valid English text found")
        
        # 生成文件名
        filename = get_audio_filename(cleaned_text)
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        # 如果文件已存在，直接返回缓存
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            print(f"[TTS] Cache hit: {filename}")
            return FileResponse(
                filepath,
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": f"inline; filename={filename}",
                    "X-Cache": "HIT"
                }
            )
        
        print(f"[TTS] Generating audio for: {cleaned_text}")
        
        # 使用 Edge-TTS 生成音频
        communicate = edge_tts.Communicate(cleaned_text, VOICE, rate=RATE)
        await communicate.save(filepath)
        
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        print(f"[TTS] Generated: {filename}")
        
        return FileResponse(
            filepath,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "X-Cache": "MISS"
            }
        )
        
    except Exception as e:
        print(f"[TTS] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

@router.get("/voices")
async def list_voices():
    """列出可用的语音"""
    try:
        voices_manager = await edge_tts.VoicesManager.create()
        en_voices = voices_manager.find(Gender="Female", Locale="en-US")
        
        return {
            "current_voice": VOICE,
            "available_voices": [
                {
                    "name": v["Name"],
                    "display_name": v["FriendlyName"],
                    "locale": v["Locale"]
                }
                for v in en_voices[:5]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cache")
async def clear_cache():
    """清理所有缓存的音频文件"""
    try:
        ensure_output_dir()
        count = 0
        for filename in os.listdir(OUTPUT_DIR):
            if filename.endswith(".mp3"):
                filepath = os.path.join(OUTPUT_DIR, filename)
                os.remove(filepath)
                count += 1
        return {"message": f"Cleared {count} cached audio files"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
