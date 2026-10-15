from datetime import date

from app.db import get_pool


async def get_holiday_for_date(target_date: date) -> dict | None:
    """Looks up `indonesia_holiday` (populated by apps/web's
    lib/indonesia-holiday.ts on every register/login/relogin) for a row on
    this exact date. Returns the raw row (API name + civic/religious/
    cuti-bersama flags) or None if today isn't a holiday."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT name, is_civic, is_religious, is_cuti_bersama
        FROM indonesia_holiday
        WHERE holiday_date = $1
        LIMIT 1
        """,
        target_date,
    )
    return dict(row) if row else None
