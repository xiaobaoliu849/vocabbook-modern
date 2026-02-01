import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:8000/api/stats/heatmap") as response:
        data = json.loads(response.read().decode())
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
