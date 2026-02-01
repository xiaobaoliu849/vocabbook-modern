"""测试 Edge TTS 功能"""
import edge_tts
import asyncio

async def test_tts():
    """测试 Edge TTS 播放"""
    text = "The quick brown fox jumps over the lazy dog."
    voice = "en-US-JennyNeural"
    
    print("正在生成语音...")
    print(f"文本: {text}")
    print(f"声音: {voice}")
    
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save("test_tts_output.mp3")
    
    print("语音文件已生成: test_tts_output.mp3")
    
    # 自动播放（Windows）
    import os
    os.system("start test_tts_output.mp3")

if __name__ == "__main__":
    asyncio.run(test_tts())
