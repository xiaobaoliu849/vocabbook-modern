"""
TTS Router - 文本转语音播放
支持 Edge-TTS 生成高质量英文语音
"""
import os
import hashlib
import re
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import FileResponse
import edge_tts

router = APIRouter()

# 配置
DEFAULT_VOICE = "en-US-JennyNeural"  # 标准英文女声
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_audio")
RATE = "+0%"  # 正常语速

def ensure_output_dir():
    """确保音频输出目录存在"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

def clean_text_for_tts(text: str) -> str:
    """
    清理文本以便TTS处理：
    1. 去除 markdown 噪声
    2. 去除 emoji
    3. 保留多语言文本并限制长度
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
    
    # 保留可读文本，移除控制字符
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', text)

    # 统一空白
    result = re.sub(r'\s+', ' ', text)
    result = result.strip()
    
    # 限制长度（放宽至 4000 个字符）
    if len(result) > 4000:
        result = result[:4000].rstrip()
    
    return result

def detect_voice(text: str) -> str:
    """根据文本特征自动选择语音。"""
    if re.search(r'[\u4e00-\u9fff]', text):
        return "zh-CN-XiaoxiaoNeural"
    if re.search(r'[\u3040-\u30ff]', text):
        return "ja-JP-NanamiNeural"
    if re.search(r'[\uac00-\ud7af]', text):
        return "ko-KR-SunHiNeural"
    if re.search(r'[\u0400-\u04ff]', text):
        return "ru-RU-SvetlanaNeural"
    return DEFAULT_VOICE


def get_audio_filename(text: str, voice: str) -> str:
    """根据文本生成唯一的文件名"""
    cache_key = f"{voice}:{text}"
    text_hash = hashlib.md5(cache_key.encode('utf-8')).hexdigest()[:12]
    return f"{text_hash}.mp3"

@router.get("/speak")
async def text_to_speech(
    text: str, 
    authorization: str = Header(None)
):
    """
    将文本转换为语音并返回音频文件
    如果已存在则直接返回缓存文件
    """
    from services.limit_service import LimitService, LimitException
    from main import get_db
    
    try:
        ensure_output_dir()
        
        # 清理文本
        cleaned_text = clean_text_for_tts(text)
        voice = detect_voice(cleaned_text)
        
        print(f"[TTS] Original text length: {len(text)}")
        print(f"[TTS] Cleaned text: {cleaned_text[:100]}...")
        print(f"[TTS] Voice: {voice}")
        
        if not cleaned_text:
            raise HTTPException(status_code=400, detail="No valid text found")
            
        # Check limits (only if generating new file to save costs!)
        filename = get_audio_filename(cleaned_text, voice)
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            try:
                limit_service = LimitService(db=get_db())
                token = authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None
                await limit_service.check_and_consume("tts", token=token)
            except LimitException as le:
                raise HTTPException(status_code=403, detail={"message": le.message, "required_tier": le.required_tier})
        
        # 生成文件名
        filename = get_audio_filename(cleaned_text, voice)
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        # 如果文件已存在，直接返回缓存
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            print(f"[TTS] Cache hit: {filename}")
            return FileResponse(
                filepath,
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": f"inline; filename={filename}",
                    "X-Cache": "HIT",
                    "X-TTS-Voice": voice
                }
            )
        
        print(f"[TTS] Generating audio for: {cleaned_text}")
        
        # 使用 Edge-TTS 生成音频
        communicate = edge_tts.Communicate(cleaned_text, voice, rate=RATE)
        await communicate.save(filepath)
        
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        print(f"[TTS] Generated: {filename}")
        
        return FileResponse(
            filepath,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "X-Cache": "MISS",
                "X-TTS-Voice": voice
            }
        )
    except HTTPException:
        raise
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
            "current_voice": DEFAULT_VOICE,
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
