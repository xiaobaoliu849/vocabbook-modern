import re

def clean_text_old(text):
    return re.sub(r'([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])', r'\1\2', text)

def clean_text_new(text):
    # Match one or more spaces that are preceded by a Chinese char AND followed by a Chinese char
    # (?<=...) is positive lookbehind (must be fixed width, which [\u4e00-\u9fa5] is)
    # (?=...) is positive lookahead
    return re.sub(r'(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])', '', text)

def test_cases():
    cases = [
        ("我 越 听 到", "我越听到"),
        ("A B C", "A B C"), # Should not touch English
        ("中 文 English 中 文", "中文 English 中文"),
        ("测试  测试", "测试测试"),
    ]

    print("Running tests with NEW regex...")
    for input_text, expected in cases:
        result = clean_text_new(input_text)
        if result != expected:
            print(f"❌ Failed: '{input_text}' -> '{result}', Expected '{expected}'")
        else:
            print(f"✅ Passed: '{input_text}' -> '{result}'")

if __name__ == "__main__":
    test_cases()
