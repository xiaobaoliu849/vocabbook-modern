"""
Attachments Router
POST /api/attachments/presign — accept a file upload, sign + push it to Evermind S3,
return objectKey for downstream dual-write.
"""
import logging
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attachments", tags=["Attachments"])

ALLOWED_MIME = {
    "image/jpeg":     ("image",    "jpg",  10 * 1024 * 1024),
    "image/png":      ("image",    "png",  10 * 1024 * 1024),
    "image/gif":      ("image",    "gif",  10 * 1024 * 1024),
    "image/webp":     ("image",    "webp", 10 * 1024 * 1024),
    "application/pdf": ("document", "pdf", 20 * 1024 * 1024),
}


@router.post("/presign")
async def presign_attachment(
    file: UploadFile = File(...),
    x_evermem_enabled: str = Header("false", alias="X-EverMem-Enabled"),
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
    authorization: Optional[str] = Header(None),
):
    from utils.evermem_helpers import prime_evermem_runtime, is_enabled, can_use_evermem

    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="unsupported_type")

    file_type, default_ext, max_bytes = ALLOWED_MIME[mime]

    file_bytes = await file.read()
    if len(file_bytes) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"file_too_large_{limit_mb}mb")

    if not is_enabled(x_evermem_enabled) or not can_use_evermem(authorization):
        raise HTTPException(status_code=400, detail="evermem_not_enabled")

    service, _requested, evermem_enabled, _authed = prime_evermem_runtime(
        authorization=authorization,
        x_evermem_enabled=x_evermem_enabled,
        x_evermem_url=x_evermem_url,
        x_evermem_key=x_evermem_key,
    )
    if not evermem_enabled or not service:
        raise HTTPException(status_code=400, detail="evermem_unavailable")

    file_name = file.filename or f"upload.{default_ext}"
    ext = (file_name.rsplit(".", 1)[-1] if "." in file_name else default_ext).lower()

    result = await service.presign_and_upload(
        file_bytes=file_bytes,
        file_name=file_name,
        file_type=file_type,
        file_ext=ext,
    )
    if not result:
        raise HTTPException(status_code=502, detail="upload_failed")

    return {
        "objectKey": result["objectKey"],
        "fileType": result["fileType"],
        "fileName": result["fileName"],
        "size": len(file_bytes),
        "mediaType": mime,
    }
