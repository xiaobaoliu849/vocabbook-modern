import os
import httpx
from fastapi import Header, HTTPException, status

# Cloud Server URL (matching limit_service and frontend)
CLOUD_API_URL = os.environ.get("CLOUD_API_URL", "http://localhost:8001")

async def get_current_user(authorization: str = Header(...)):
    """
    Dependency to validate the Bearer token against the cloud server.
    Returns the user data if valid, otherwise raises 401.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ")[1]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CLOUD_API_URL}/users/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5.0
            )

            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token. Please log in again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Authentication failed (Status: {resp.status_code})",
                    headers={"WWW-Authenticate": "Bearer"},
                )
    except httpx.RequestError as exc:
        # If cloud server is unreachable, we cannot verify the user.
        # For security-critical AI features, we must fail-closed.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Authentication server unreachable. Please check your internet connection."
        )
