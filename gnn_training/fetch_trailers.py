import os
import time
import requests
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

TMDB_TOKEN = os.getenv("TMDB_ACCESS_TOKEN")
DB_CONFIG  = {
    "host"    : os.getenv("DB_HOST",     "localhost"),
    "port"    : int(os.getenv("DB_PORT", "3306")),
    "user"    : os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", "root"),
    "database": os.getenv("DB_NAME",     "gnn_movie"),
}

HEADERS = {
    "Authorization": f"Bearer {TMDB_TOKEN}",
    "accept"       : "application/json",
}


def get_trailer_key(tmdb_id: int) -> str | None:
    """Fetch YouTube trailer key from TMDB for a given movie."""
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}/videos"
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        if res.status_code != 200:
            return None
        data = res.json()
        videos = data.get("results", [])

        # Priority: Official Trailer on YouTube
        for v in videos:
            if v.get("site") == "YouTube" and v.get("type") == "Trailer" and v.get("official"):
                return v["key"]
        # Fallback: any Trailer on YouTube
        for v in videos:
            if v.get("site") == "YouTube" and v.get("type") == "Trailer":
                return v["key"]
        # Fallback: any YouTube video
        for v in videos:
            if v.get("site") == "YouTube":
                return v["key"]
        return None
    except Exception:
        return None


def main():
    conn   = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)

    # Get all movies that have tmdb_id but no trailer_key yet
    cursor.execute("""
        SELECT movie_id, title, tmdb_id
        FROM movies
        WHERE tmdb_id IS NOT NULL
          AND (trailer_key IS NULL OR trailer_key = '')
        ORDER BY movie_id
    """)
    movies = cursor.fetchall()
    print(f"Movies to fetch trailers: {len(movies)}")

    update_cursor = conn.cursor()
    success = 0
    failed  = 0

    for i, movie in enumerate(movies, 1):
        trailer_key = get_trailer_key(movie["tmdb_id"])

        if trailer_key:
            update_cursor.execute(
                "UPDATE movies SET trailer_key = %s WHERE movie_id = %s",
                (trailer_key, movie["movie_id"])
            )
            conn.commit()
            success += 1
            print(f"[{i}/{len(movies)}] ✓ {movie['title']} → {trailer_key}")
        else:
            failed += 1
            print(f"[{i}/{len(movies)}] ✗ {movie['title']} — no trailer found")

        # Rate limit: 40 requests/second TMDB allows
        if i % 40 == 0:
            time.sleep(1)

    cursor.close()
    update_cursor.close()
    conn.close()

    print(f"\nDone! Success: {success} | Failed: {failed}")


if __name__ == "__main__":
    main()