import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "vocab.db")
RESOURCE_DIR = os.path.join(BASE_DIR, "resources")
SOUNDS_DIR = os.path.join(RESOURCE_DIR, "sounds")

# Ensure directories exist
os.makedirs(RESOURCE_DIR, exist_ok=True)
os.makedirs(SOUNDS_DIR, exist_ok=True)
