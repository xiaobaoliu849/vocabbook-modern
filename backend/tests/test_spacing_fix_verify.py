import re

def clean_text(text):
    # Regex to remove spaces between Chinese characters
    return re.sub(r'([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])', r'\1\2', text)

def test_cases():
    cases = [
        ("我 越 听 到", "我越听到"),
        ("Hello World", "Hello World"),
        ("Hello World 你 好", "Hello World 你好"),
        ("Testing 1 2 3", "Testing 1 2 3"),
        ("中 文 English 中 文", "中文 English 中文"),
        ("Simple text", "Simple text"),
        ("现代  雕塑", "现代雕塑"), # multiple spaces
    ]

    print("Running verification tests...")
    all_passed = True
    for input_text, expected in cases:
        result = clean_text(input_text)
        if result != expected:
            print(f"❌ Failed: Input '{input_text}' -> Got '{result}', Expected '{expected}'")
            all_passed = False
        else:
            print(f"✅ Passed: '{input_text}' -> '{result}'")

    if all_passed:
        print("\nAll tests passed successfully!")
    else:
        print("\nSome tests failed.")

if __name__ == "__main__":
    test_cases()
