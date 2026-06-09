import os
from fastapi import HTTPException, Request


async def require_owner(request: Request) -> None:
    token = os.environ.get("OWNER_TOKEN")
    if not token:
        return

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and auth[7:] == token:
        return

    if request.headers.get("X-Owner-Token") == token:
        return

    raise HTTPException(status_code=401, detail="Unauthorized")
