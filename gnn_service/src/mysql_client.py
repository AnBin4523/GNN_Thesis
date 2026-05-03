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
    Returns: [{ movie_id, title, year_published, genres, poster_path, avg_rating, total_ratings }, ...]
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT m.movie_id, m.title, m.year_published, m.genres, m.poster_path,
                   ROUND(AVG(r.rating), 1) AS avg_rating,
                   COUNT(r.rating)         AS total_ratings
            FROM movies m
            LEFT JOIN ratings r ON m.movie_id = r.movie_id
            WHERE m.title LIKE %s
            GROUP BY m.movie_id, m.title, m.year_published, m.genres, m.poster_path
            ORDER BY m.title
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
    Returns: [{ movie_id, title, year_published, genres, poster_path, avg_rating, total_ratings }, ...]
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        if genre:
            cursor.execute(
                """
                SELECT m.movie_id, m.title, m.year_published, m.genres, m.poster_path,
                       ROUND(AVG(r.rating), 1) AS avg_rating,
                       COUNT(r.rating)         AS total_ratings
                FROM movies m
                LEFT JOIN ratings r ON m.movie_id = r.movie_id
                WHERE m.genres LIKE %s
                GROUP BY m.movie_id, m.title, m.year_published, m.genres, m.poster_path
                ORDER BY m.title
                LIMIT %s OFFSET %s
                """,
                (f"%{genre}%", limit, offset)
            )
        else:
            cursor.execute(
                """
                SELECT m.movie_id, m.title, m.year_published, m.genres, m.poster_path,
                       ROUND(AVG(r.rating), 1) AS avg_rating,
                       COUNT(r.rating)         AS total_ratings
                FROM movies m
                LEFT JOIN ratings r ON m.movie_id = r.movie_id
                GROUP BY m.movie_id, m.title, m.year_published, m.genres, m.poster_path
                ORDER BY m.title
                LIMIT %s OFFSET %s
                """,
                (limit, offset)
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


# ============================================================
# RATING QUERIES
# ============================================================


def upsert_rating(user_id: int, movie_id: int, rating: int) -> None:
    """
    Insert or update a rating (1-5).
    Uses ON DUPLICATE KEY so rating same movie again just updates.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO ratings (user_id, movie_id, rating)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                rating   = VALUES(rating),
                rated_at = CURRENT_TIMESTAMP
            """,
            (user_id, movie_id, rating)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def delete_rating(user_id: int, movie_id: int) -> None:
    """Remove a rating (user un-rates a movie)."""
    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM ratings WHERE user_id = %s AND movie_id = %s",
            (user_id, movie_id)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_user_rating(user_id: int, movie_id: int) -> int | None:
    """
    Get a single user's rating for a movie.
    Returns rating (1-5) or None if not rated.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT rating FROM ratings WHERE user_id = %s AND movie_id = %s",
            (user_id, movie_id)
        )
        row = cursor.fetchone()
        return row[0] if row else None
    finally:
        cursor.close()
        conn.close()


def get_movie_rating_stats(movie_id: int) -> dict:
    """
    Get average rating and total count for a movie.
    Returns: { avg_rating: float, total_ratings: int }
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                ROUND(AVG(rating), 1) AS avg_rating,
                COUNT(*)              AS total_ratings
            FROM ratings
            WHERE movie_id = %s
            """,
            (movie_id,)
        )
        row = cursor.fetchone()
        return {
            "avg_rating"   : float(row["avg_rating"]) if row["avg_rating"] else None,
            "total_ratings": int(row["total_ratings"]),
        }
    finally:
        cursor.close()
        conn.close()


def get_user_rated_movies(user_id: int) -> list[dict]:
    """
    Get all movies a web user has rated.
    Returns: [{ movie_id, rating, rated_at }, ...]
    Used for rating-based surrogate mapping.
    """
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT movie_id, rating, rated_at
            FROM ratings
            WHERE user_id = %s
            ORDER BY rated_at DESC
            """,
            (user_id,)
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()