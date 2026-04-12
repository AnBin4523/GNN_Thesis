import re
import time
import requests
import pandas as pd
import mysql.connector
from dotenv import load_dotenv
import os

load_dotenv()

# ============================================================
# CONFIG
# ============================================================
TMDB_ACCESS_TOKEN = os.getenv("TMDB_ACCESS_TOKEN")
TMDB_BASE_URL     = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE   = "https://image.tmdb.org/t/p/w500"

DB_CONFIG = {
    "host"    : os.getenv("DB_HOST", "localhost"),
    "port"    : int(os.getenv("DB_PORT", 3306)),
    "user"    : os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "root"),
    "database": os.getenv("DB_NAME", "gnn_movie"),
}

DATA_DIR = "./gnn_training/data/ml-1m"

HEADERS = {
    "Authorization": f"Bearer {TMDB_ACCESS_TOKEN}",
    "accept": "application/json"
}

# ============================================================
# HELPER: Parse ML-1M title
# ============================================================
def parse_title_year(raw_title: str):
    """
    Input : "Toy Story (1995)"
    Output: ("Toy Story", 1995)
    """
    match = re.match(r"^(.*)\s*\((\d{4})\)\s*$", raw_title.strip())
    if match:
        title = match.group(1).strip()
        year  = int(match.group(2))
        return title, year
    return raw_title.strip(), None


# ============================================================
# TMDB: Search movie
# ============================================================
def search_tmdb(title: str, year: int = None):
    """Search TMDB by title and optional year."""
    params = {"query": title, "language": "en-US", "page": 1}
    if year:
        params["year"] = year

    try:
        res = requests.get(
            f"{TMDB_BASE_URL}/search/movie",
            headers=HEADERS,
            params=params,
            timeout=10
        )
        if res.status_code == 200:
            results = res.json().get("results", [])
            if results:
                return results[0]  # take first result
    except Exception as e:
        print(f"  Search error: {e}")
    return None


def get_movie_details(tmdb_id: int):
    """Get full movie details including credits."""
    try:
        # Movie details
        detail_res = requests.get(
            f"{TMDB_BASE_URL}/movie/{tmdb_id}",
            headers=HEADERS,
            params={"language": "en-US"},
            timeout=10
        )
        # Credits
        credits_res = requests.get(
            f"{TMDB_BASE_URL}/movie/{tmdb_id}/credits",
            headers=HEADERS,
            timeout=10
        )

        if detail_res.status_code == 200 and credits_res.status_code == 200:
            detail  = detail_res.json()
            credits = credits_res.json()

            actors = ", ".join(
                [c["name"] for c in credits.get("cast", [])[:5]]
            )
            directors = ", ".join(
                [c["name"] for c in credits.get("crew", [])
                 if c["job"] == "Director"][:2]
            )

            return {
                "tmdb_id"    : tmdb_id,
                "poster_path": detail.get("poster_path"),
                "plot"       : detail.get("overview", ""),
                "actors"     : actors,
                "directors"  : directors,
            }
    except Exception as e:
        print(f"  Detail error: {e}")
    return None


# ============================================================
# MySQL
# ============================================================
def create_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS movies (
            movie_id       INT PRIMARY KEY,
            title          VARCHAR(255),
            year_published INT,
            genres         VARCHAR(255),
            poster_path    VARCHAR(255),
            plot           TEXT,
            actors         VARCHAR(500),
            directors      VARCHAR(255),
            tmdb_id        INT
        )
    """)


def insert_movie(cursor, movie: dict):
    cursor.execute("""
        INSERT INTO movies
            (movie_id, title, year_published, genres,
             poster_path, plot, actors, directors, tmdb_id)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            poster_path = VALUES(poster_path),
            plot        = VALUES(plot),
            actors      = VALUES(actors),
            directors   = VALUES(directors),
            tmdb_id     = VALUES(tmdb_id)
    """, (
        movie["movie_id"],
        movie["title"],
        movie["year"],
        movie["genres"],
        movie.get("poster_path"),
        movie.get("plot", ""),
        movie.get("actors", ""),
        movie.get("directors", ""),
        movie.get("tmdb_id"),
    ))


# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 55)
    print("Fetch Movies from TMDB → Insert into MySQL")
    print("=" * 55)

    # Load ML-1M movies
    movies_df = pd.read_csv(
        f"{DATA_DIR}/movies.dat",
        sep="::", engine="python",
        names=["movie_id", "title", "genres"],
        encoding="latin-1"
    )
    print(f"Loaded {len(movies_df):,} movies from ML-1M")

    # Connect MySQL
    conn   = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    create_table(cursor)
    conn.commit()
    print("Connected to MySQL\n")

    success = 0
    failed  = 0

    for _, row in movies_df.iterrows():
        movie_id  = int(row["movie_id"])
        raw_title = row["title"]
        genres    = row["genres"].replace("|", ", ")

        title, year = parse_title_year(raw_title)

        # Check if already inserted
        cursor.execute(
            "SELECT movie_id FROM movies WHERE movie_id = %s", (movie_id,)
        )
        if cursor.fetchone():
            continue  # skip already inserted

        # Search TMDB
        result = search_tmdb(title, year)

        movie_data = {
            "movie_id": movie_id,
            "title"   : title,
            "year"    : year,
            "genres"  : genres,
        }

        if result:
            tmdb_id = result["id"]
            details = get_movie_details(tmdb_id)

            if details:
                movie_data.update(details)
                success += 1
                print(f"  [{success:4d}] ✅ {title} ({year})")
            else:
                failed += 1
                print(f"  [    ] ❌ {title} — no details")
        else:
            failed += 1
            print(f"  [    ] ❌ {title} — not found on TMDB")

        insert_movie(cursor, movie_data)
        conn.commit()

        # Respect TMDB rate limit (40 requests/10s)
        time.sleep(0.3)

    cursor.close()
    conn.close()

    print("\n" + "=" * 55)
    print(f"Done! Success: {success} | Failed: {failed}")
    print("=" * 55)


if __name__ == "__main__":
    main()