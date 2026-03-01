import pytest
from utils.import_utils import parse_csv_content

def test_parse_csv_content_standard():
    """Test standard CSV with word and meaning"""
    content = "apple,苹果\nbanana,香蕉"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉"}
    ]

def test_parse_csv_content_full():
    """Test CSV with word, meaning, and phonetic (3 columns)"""
    content = "apple,苹果,/ˈæpl/\nbanana,香蕉,/bəˈnɑːnə/"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果", "phonetic": "/ˈæpl/"},
        {"word": "banana", "meaning": "香蕉", "phonetic": "/bəˈnɑːnə/"}
    ]

def test_parse_csv_content_only_word():
    """Test CSV with only word column"""
    content = "apple\nbanana"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple"},
        {"word": "banana"}
    ]

def test_parse_csv_content_with_spaces():
    """Test CSV with leading/trailing spaces in fields"""
    content = "  apple  ,  苹果  \n banana , 香蕉 , /bəˈnɑːnə/ "
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉", "phonetic": "/bəˈnɑːnə/"}
    ]

def test_parse_csv_content_empty_lines_and_first_column():
    """Test skipping empty lines and rows with empty first column"""
    content = "apple,苹果\n\n,meaning\n  \nbanana,香蕉"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉"}
    ]

def test_parse_csv_content_comments():
    """Test skipping comment lines starting with #"""
    content = "# This is a comment\napple,苹果\n # This is not a comment (space before #)\nbanana,香蕉"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉"}
    ]

def test_parse_csv_content_quoted_fields():
    """Test CSV with quoted fields containing commas"""
    content = '"apple, red",苹果\nbanana,"香蕉, 黄色"'
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple, red", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉, 黄色"}
    ]

def test_parse_csv_content_extra_columns():
    """Test CSV with more than 3 columns (extra columns should be ignored)"""
    content = "apple,苹果,/ˈæpl/,extra1,extra2"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果", "phonetic": "/ˈæpl/"}
    ]
