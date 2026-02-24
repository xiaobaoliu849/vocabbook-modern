import csv
import io
from typing import List

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
