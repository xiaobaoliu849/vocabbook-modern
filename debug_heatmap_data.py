import sqlite3
from datetime import datetime

db_path = "backend/vocab.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

today = datetime.now().strftime('%Y-%m-%d')
print(f"Checking for date: {today}")

cursor.execute("SELECT review_date, count(*) FROM review_history GROUP BY review_date")
rows = cursor.fetchall()

print("Review History Data:")
found_today = False
for row in rows:
    print(f"Date: {row[0]}, Count: {row[1]}")
    if row[0] == today:
        found_today = True

if not found_today:
    print(f"WARNING: No records found for today ({today})")
else:
    print(f"SUCCESS: Records found for today ({today})")

conn.close()
