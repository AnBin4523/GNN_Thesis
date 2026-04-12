import os
import mysql.connector
from mysql.connector.pooling import MySQLConnectionPool
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# CONNECTION POOL
# ============================================================
_pool = None

def get_pool() -> MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = MySQLConnectionPool(
            pool_name    = "gnn_pool",
            pool_size    = 5,
            host         = os.getenv("DB_HOST",     "localhost"),
            port         = int(os.getenv("DB_PORT", "3306")),
            user         = os.getenv("DB_USER",     "root"),
            password     = os.getenv("DB_PASSWORD", "root"),
            database     = os.getenv("DB_NAME",     "gnn_movie"),
            charset      = "utf8mb4",
        )
    return _pool


def _get_conn():
    return get_pool().get_connection()


# ============================================================
# MOVIE QUERIES
# ============================================================

def get_movie_metadata(movie_id: int) -> dict | None:
    """
    Get full movie metadata from MySQL (poster, plot, actors, directors).
    Returns: { movie_id, title, year_published, genres, poster_path, plot, actors, directors, tmdb_id }
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT * FROM movies WHERE movie_id = %s LIMIT 1",
            (movie_id,)
        )
        row = cursor.fetchone()
        return row  # None if not found
    finally:
        cursor.close()
        conn.close()


def get_movies_metadata_batch(movie_ids: list[int]) -> dict[int, dict]:
    """
    Get metadata for multiple movies in one query.
    Returns: { movie_id: { ...metadata }, ... }
    """
    if not movie_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(movie_ids))
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            f"SELECT * FROM movies WHERE movie_id IN ({placeholders})",
            tuple(movie_ids)
        )
        rows = cursor.fetchall()
        return {row["movie_id"]: row for row in rows}
    finally:
        cursor.close()
        conn.close()


def search_movies(query: str, limit: int = 20) -> list[dict]:
    """
    Search movies by title (partial match).
    Returns: [{ movie_id, title, year_published, genres, poster_path }, ...]
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT movie_id, title, year_published, genres, poster_path
            FROM movies
            WHERE title LIKE %s
            ORDER BY title
            LIMIT %s
            """,
            (f"%{query}%", limit)
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


def get_movies_by_genre(genre: str, limit: int = 20, offset: int = 0) -> list[dict]:
    """
    Get movies filtered by genre.
    Returns: [{ movie_id, title, year_published, genres, poster_path }, ...]
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT movie_id, title, year_published, genres, poster_path
            FROM movies
            WHERE genres LIKE %s
            ORDER BY title
            LIMIT %s OFFSET %s
            """,
            (f"%{genre}%", limit, offset)
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


# ============================================================
# USER QUERIES
# ============================================================

def get_web_user_by_email(email: str) -> dict | None:
    """
    Get web user by email (for login).
    Returns: { user_id, email, password_hash, display_name, preferred_genres, ml1m_user_id }
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT * FROM users WHERE email = %s LIMIT 1",
            (email,)
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def get_web_user_by_id(user_id: int) -> dict | None:
    """Get web user by primary key."""
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT user_id, email, display_name, preferred_genres, ml1m_user_id, created_at "
            "FROM users WHERE user_id = %s LIMIT 1",
            (user_id,)
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def create_web_user(
    email: str,
    password_hash: str,
    display_name: str,
    preferred_genres: str,
    ml1m_user_id: int,
) -> int:
    """
    Insert a new web user. Returns the new user_id.
    preferred_genres: comma-separated string, e.g. "Action,Comedy"
    ml1m_user_id   : mapped ML-1M user index from recommend.map_genre_to_user()
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (email, password_hash, display_name, preferred_genres, ml1m_user_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (email, password_hash, display_name, preferred_genres, ml1m_user_id)
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        cursor.close()
        conn.close()


def update_ml1m_user_id(user_id: int, ml1m_user_id: int) -> None:
    """Update the ML-1M user mapping for a web user."""
    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET ml1m_user_id = %s WHERE user_id = %s",
            (ml1m_user_id, user_id)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()