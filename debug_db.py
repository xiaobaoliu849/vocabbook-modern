import sqlite3
from datetime import datetime

db_path = "backend/vocab.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

today = datetime.now().strftime('%Y-%m-%d')
print(f"Checking review history for today: {today}")

# Check count for today
cursor.execute("SELECT COUNT(*) FROM review_history WHERE review_date = ?", (today,))
count = cursor.fetchone()[0]
print(f"Reviews today: {count}")

# Check last 5 entries
print("\nLast 5 entries in review_history:")
cursor.execute("SELECT * FROM review_history ORDER BY id DESC LIMIT 5")
rows = cursor.fetchall()
for row in rows:
    print(row)

# Check total count
cursor.execute("SELECT COUNT(*) FROM review_history")
total = cursor.fetchone()[0]
print(f"\nTotal reviews in history: {total}")

conn.close()
