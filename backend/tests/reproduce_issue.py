import re

def clean_chinese_text(text):
    # Current implementation
    return re.sub(r'(?<=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+(?=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])', '', text)

def analyze_string(text):
    print(f"Analyzing: '{text}'")
    for i, char in enumerate(text):
        print(f"  Char: '{char}' | Code: {ord(char):04x} | Name: {char.encode('unicode_escape')}")

text = "从 其 当前 端口 中断 总线 连接 ， 并 将 其 跟用 粗体 字 显示 的 一个 设备 交换 。 已 断开 连接 。"

print("--- Analysis ---")
analyze_string(text)

print("\n--- Test Cleaning ---")
cleaned = clean_chinese_text(text)
print(f"Original: {text}")
print(f"Cleaned:  {cleaned}")

expected = "从其当前端口中断总线连接，并将其跟用粗体字显示的一个设备交换。已断开连接。"
if cleaned == expected:
    print("✅ Match!")
else:
    print("❌ Mismatch!")
    # Find first diff
    for i, (c1, c2) in enumerate(zip(cleaned, expected)):
        if c1 != c2:
            print(f"Diff at index {i}: Got '{c1}' ({ord(c1):04x}), Expected '{c2}' ({ord(c2):04x})")
            break
