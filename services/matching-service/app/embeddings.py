"""Sentence-Transformers embedding + pgvector semantic search — docs/plan.md
SS4 steps 8-9. Lazy, thread-safe singleton load, same pattern as
services/ai-advisor/app/gemma.py, so this service's own startup/health
check stays fast; the first request that needs semantic search pays the
one-time model load cost.

Model: sentence-transformers/all-MiniLM-L6-v2 — 384-dim output, chosen
specifically because it matches products.embedding's existing
`vector(384)` column exactly (see data/01_alter_products_schema.sql)."""

import threading

import asyncpg
from sentence_transformers import SentenceTransformer

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_model: SentenceTransformer | None = None
_lock = threading.Lock()


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _model


def is_loaded() -> bool:
    return _model is not None


def encode(text: str) -> list[float]:
    model = get_model()
    return model.encode(text, normalize_embeddings=True).tolist()


async def semantic_search(
    pool: asyncpg.Pool, query_vector: list[float], categories: list[str] | None = None, limit: int = 15
) -> list[asyncpg.Record]:
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"
    where = "embedding IS NOT NULL AND stock_quantity > 0"
    params: list = [vector_literal]
    if categories:
        params.append(categories)
        where += f" AND category = ANY(${len(params)})"
    params.append(limit)

    sql = f"""
        SELECT *, 1 - (embedding <=> $1::vector) AS semantic_score
        FROM products
        WHERE {where}
        ORDER BY embedding <=> $1::vector
        LIMIT ${len(params)}
    """
    return await pool.fetch(sql, *params)
