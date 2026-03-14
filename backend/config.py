import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("VOCABBOOK_DATA_DIR", BASE_DIR)

DB_PATH = os.path.join(DATA_DIR, "vocab.db")
RESOURCE_DIR = os.path.join(DATA_DIR, "resources")
SOUNDS_DIR = os.path.join(RESOURCE_DIR, "sounds")

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(RESOURCE_DIR, exist_ok=True)
os.makedirs(SOUNDS_DIR, exist_ok=True)
