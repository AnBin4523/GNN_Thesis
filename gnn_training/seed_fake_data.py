"""
seed_fake_data.py
-----------------
Seed fake web users and ratings into MySQL for demo purposes.

What this does:
  1. Generate N fake web users with realistic names/emails/genres
  2. For each user, pick a random ML-1M user as surrogate (genre-based)
  3. Seed 10-40 ratings per user using that surrogate's ML-1M rating history
     so the data is realistic (not purely random)

Usage:
  pip install faker --break-system-packages
  python gnn_training/seed_fake_data.py
"""

import os
import sys
import random
import hashlib
import pandas as pd
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

# ── Try import Faker ──
try:
    from faker import Faker
except ImportError:
    print("Faker not installed. Run: pip install faker")
    sys.exit(1)

fake = Faker()

# ============================================================
# CONFIG
# ============================================================
DB_CONFIG = {
    "host"    : os.getenv("DB_HOST",     "localhost"),
    "port"    : int(os.getenv("DB_PORT", "3306")),
    "user"    : os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", "root"),
    "database": os.getenv("DB_NAME",     "gnn_movie"),
}

DATA_DIR     = "./gnn_training/data/ml-1m"
NUM_USERS    = 200     # số fake users cần tạo
MIN_RATINGS  = 15      # minimum ratings per user
MAX_RATINGS  = 60      # maximum ratings per user
DEFAULT_PW   = hashlib.sha256("demo1234".encode()).hexdigest()

GENRES = [
    "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
    "Horror", "Musical", "Mystery", "Romance", "Sci-Fi",
    "Thriller", "War", "Western",
]


# ============================================================
# LOAD ML-1M DATA
# ============================================================
def load_ml1m():
    print("Loading ML-1M data...")
    ratings = pd.read_csv(
        f"{DATA_DIR}/ratings.dat", sep="::", engine="python",
        names=["user_id", "movie_id", "rating", "timestamp"],
        encoding="latin-1"
    )
    # Only positive interactions (same as training)
    ratings = ratings[ratings["rating"] >= 4]

    # Build dict: ml1m_user_id → list of (movie_id, rating)
    user_ratings = {}
    for _, row in ratings.iterrows():
        uid = int(row["user_id"])
        if uid not in user_ratings:
            user_ratings[uid] = []
        user_ratings[uid].append((int(row["movie_id"]), int(row["rating"])))

    print(f"  Loaded {len(user_ratings)} ML-1M users with ratings")
    return user_ratings


# ============================================================
# SEED FUNCTIONS
# ============================================================
def seed_user(cursor, email, display_name, preferred_genres, ml1m_user_id):
    """Insert a fake web user. Returns new user_id."""
    genres_str = ",".join(preferred_genres)
    cursor.execute(
        """
        INSERT INTO users
            (email, password_hash, display_name, preferred_genres, ml1m_user_id)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (email, DEFAULT_PW, display_name, genres_str, ml1m_user_id)
    )
    return cursor.lastrowid


def seed_ratings(cursor, user_id, movie_ratings):
    """Batch insert ratings for a user."""
    cursor.executemany(
        """
        INSERT IGNORE INTO ratings (user_id, movie_id, rating)
        VALUES (%s, %s, %s)
        """,
        [(user_id, movie_id, min(rating, 5))  # cap at 5
         for movie_id, rating in movie_ratings]
    )


# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 55)
    print("Seed Fake Users & Ratings")
    print(f"  Users    : {NUM_USERS}")
    print(f"  Ratings  : {MIN_RATINGS}–{MAX_RATINGS} per user")
    print(f"  Password : demo1234")
    print("=" * 55)

    # Load ML-1M ratings
    user_ratings = load_ml1m()
    ml1m_user_ids = list(user_ratings.keys())

    # Connect MySQL
    conn   = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # Check existing user count
    cursor.execute("SELECT COUNT(*) FROM users")
    existing = cursor.fetchone()[0]
    print(f"\nExisting users in DB: {existing}")

    seeded_users   = 0
    seeded_ratings = 0
    used_emails    = set()
    surrogate_count = {}  # track how many users per surrogate

    for i in range(NUM_USERS):
        # Generate unique email
        while True:
            email = fake.email()
            if email not in used_emails:
                used_emails.add(email)
                break

        display_name = fake.name()

        # Pick 2-5 random genres (more variety)
        preferred_genres = random.sample(GENRES, random.randint(2, 5))

        # Pick surrogate — prefer less-used ones for diversity
        # Weight inversely by usage count
        weights = [1 / (surrogate_count.get(uid, 0) + 1) for uid in ml1m_user_ids]
        ml1m_user_id = random.choices(ml1m_user_ids, weights=weights, k=1)[0]
        surrogate_count[ml1m_user_id] = surrogate_count.get(ml1m_user_id, 0) + 1

        # Insert user
        try:
            user_id = seed_user(
                cursor, email, display_name,
                preferred_genres, ml1m_user_id
            )
            conn.commit()
            seeded_users += 1
        except mysql.connector.IntegrityError:
            conn.rollback()
            continue  # duplicate email, skip

        # Pick random subset of surrogate's rated movies
        surrogate_movies = user_ratings[ml1m_user_id]
        n_ratings = min(
            random.randint(MIN_RATINGS, MAX_RATINGS),
            len(surrogate_movies)
        )
        sampled = random.sample(surrogate_movies, n_ratings)

        # Add small noise to ratings (±1, capped 1-5)
        noisy = []
        for movie_id, rating in sampled:
            noise = random.choices([-2, -1, 0, 0, 1, 2], weights=[5, 15, 40, 40, 15, 5])[0]
            noisy_rating = max(3, min(5, rating + noise))  # clamp 3-5
            noisy.append((movie_id, noisy_rating))

        seed_ratings(cursor, user_id, noisy)
        conn.commit()
        seeded_ratings += len(noisy)

        print(f"  [{i+1:3d}/{NUM_USERS}] {display_name:<30} "
              f"→ ML-1M #{ml1m_user_id:<5} | {len(noisy)} ratings")

    cursor.close()
    conn.close()

    print("\n" + "=" * 55)
    print(f"Done!")
    print(f"  Users seeded  : {seeded_users}")
    print(f"  Ratings seeded: {seeded_ratings}")
    print(f"  Avg ratings/user: {seeded_ratings // max(seeded_users, 1)}")
    print("=" * 55)
    print("\nAll fake users have password: demo1234")


if __name__ == "__main__":
    main()