import asyncio
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.evermem_service import EverMemService

async def main():
    service = EverMemService(api_url="https://api.evermind.ai", api_key=os.environ.get("EVERMEMOS_API_KEY", ""))
    
    # We don't want to actually add a memory if we don't have to, let's just search
    user_id = "381450393@qq.com"  # Example user ID or whatever the frontend uses
    query = "我想知道我之前都问过哪些问题"
    
    print(f"Testing search for user '{user_id}' with query '{query}'...")
    try:
        search_resp = await service.search_memories(query, user_id=user_id)
        print(f"Extracted Search Response:")
        for sm in search_resp:
            print(f"- {sm.get('content')}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
