import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Callable, TypeVar

T = TypeVar("T")
_DB_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="vocabbook-db")
_IO_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="vocabbook-io")


async def _run_on_executor(
    executor: ThreadPoolExecutor,
    func: Callable[..., T],
    *args: Any,
    **kwargs: Any,
) -> T:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, partial(func, *args, **kwargs))


async def run_db_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run synchronous database work on the dedicated DB executor thread."""
    return await _run_on_executor(_DB_EXECUTOR, func, *args, **kwargs)


async def run_io_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run other blocking I/O work on the shared generic executor."""
    return await _run_on_executor(_IO_EXECUTOR, func, *args, **kwargs)


async def run_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Backward-compatible alias for generic blocking I/O execution."""
    return await run_io_blocking(func, *args, **kwargs)


def shutdown_blocking_executors() -> None:
    _IO_EXECUTOR.shutdown(wait=True, cancel_futures=False)
    _DB_EXECUTOR.shutdown(wait=True, cancel_futures=False)
