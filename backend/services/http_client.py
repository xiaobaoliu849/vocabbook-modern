"""共享的 httpx.AsyncClient，复用连接池。

原先各处每次请求都新建 AsyncClient，TCP/TLS 连接无法复用，
高延迟场景（LLM 流式、云端鉴权检查）白白多付握手开销。

用法：
    from services.http_client import get_http_client
    client = get_http_client()
    resp = await client.get(url, timeout=3.0)  # 单请求可覆盖超时

注意：不要在 ``async with get_http_client() as client`` 里使用——
共享客户端由进程统一管理，在应用关闭时通过 close_http_client() 释放。
"""
import threading
from typing import Optional

import httpx

_client: Optional[httpx.AsyncClient] = None
_client_lock = threading.Lock()


def get_http_client() -> httpx.AsyncClient:
    """获取进程级共享的 AsyncClient（懒加载，线程安全）。"""
    global _client
    if _client is None or _client.is_closed:
        with _client_lock:
            if _client is None or _client.is_closed:
                _client = httpx.AsyncClient(
                    timeout=30.0,
                    limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
                )
    return _client


async def close_http_client() -> None:
    """关闭共享客户端。仅在应用关闭时调用。"""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
