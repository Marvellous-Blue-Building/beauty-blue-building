"""One-time backfill of products.embedding — the column has existed since
data/01_alter_products_schema.sql but every row is NULL until this runs
(no embedding model was deployed before services/matching-service/app/
embeddings.py). Safe to re-run: only updates rows where embedding IS NULL.

Run from services/matching-service with its venv active:
    python scripts/backfill_embeddings.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import close_pool, get_pool  # noqa: E402
from app.embeddings import get_model  # noqa: E402

BATCH_SIZE = 256


def _encode_text(row) -> str:
    parts = [row["name"], row["brand"], row["category"], row["description"], row["ingredients"]]
    return " ".join(p for p in parts if p)


async def main() -> None:
    pool = await get_pool()
    model = get_model()  # load once, up front — this script isn't a long-running server

    total = await pool.fetchval("SELECT count(*) FROM products WHERE embedding IS NULL")
    print(f"{total} products need embeddings")
    if total == 0:
        await close_pool()
        return

    done = 0
    while True:
        rows = await pool.fetch(
            "SELECT id, name, brand, category, description, ingredients FROM products "
            "WHERE embedding IS NULL LIMIT $1",
            BATCH_SIZE,
        )
        if not rows:
            break

        texts = [_encode_text(r) for r in rows]
        vectors = model.encode(texts, normalize_embeddings=True)

        async with pool.acquire() as conn:
            async with conn.transaction():
                for row, vector in zip(rows, vectors):
                    vector_literal = "[" + ",".join(str(v) for v in vector.tolist()) + "]"
                    await conn.execute(
                        "UPDATE products SET embedding = $1::vector WHERE id = $2", vector_literal, row["id"]
                    )

        done += len(rows)
        print(f"{done}/{total} done")

    await close_pool()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
