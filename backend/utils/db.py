"""
Shared database dependency injection for routers.
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager


def get_db() -> "DatabaseManager":
    """获取数据库实例（统一入口，避免每个 router 重复定义）"""
    from main import get_db as main_get_db
    return main_get_db()
