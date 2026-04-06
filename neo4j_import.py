import pandas as pd
from neo4j import GraphDatabase

NEO4J_URI      = "bolt://localhost:7687"
NEO4J_USER     = "neo4j"
NEO4J_PASSWORD = "anbin4523"

DATA_DIR = "./gnn_thesis/data/ml-1m"

# Age group mapping từ ML-1M
AGE_MAP = {
    1:  "Under 18",
    18: "18-24",
    25: "25-34",
    35: "35-44",
    45: "45-49",
    50: "50-55",
    56: "56+"
}

OCCUPATION_MAP = {
    0:  "other",
    1:  "academic/educator",
    2:  "artist",
    3:  "clerical/admin",
    4:  "college/grad student",
    5:  "customer service",
    6:  "doctor/health care",
    7:  "executive/managerial",
    8:  "farmer",
    9:  "homemaker",
    10: "K-12 student",
    11: "lawyer",
    12: "programmer",
    13: "retired",
    14: "sales/marketing",
    15: "scientist",
    16: "self-employed",
    17: "technician/engineer",
    18: "tradesman/craftsman",
    19: "unemployed",
    20: "writer"
}

# ============================================================
# LOAD DATA
# ============================================================
def load_data():
    print("Loading ML-1M data...")

    ratings = pd.read_csv(
        f"{DATA_DIR}/ratings.dat", sep="::", engine="python",
        names=["user_id", "movie_id", "rating", "timestamp"],
        encoding="latin-1"
    )
    movies = pd.read_csv(
        f"{DATA_DIR}/movies.dat", sep="::", engine="python",
        names=["movie_id", "title", "genres"], encoding="latin-1"
    )
    users = pd.read_csv(
        f"{DATA_DIR}/users.dat", sep="::", engine="python",
        names=["user_id", "gender", "age", "occupation", "zip_code"],
        encoding="latin-1"
    )

    # Chỉ lấy rating >= 4 (positive feedback)
    ratings = ratings[ratings["rating"] >= 4].copy()

    print(f"  Users     : {users['user_id'].nunique():,}")
    print(f"  Movies    : {movies['movie_id'].nunique():,}")
    print(f"  Ratings>=4: {len(ratings):,}")
    return ratings, movies, users


# ============================================================
# IMPORT FUNCTIONS
# ============================================================
def clear_database(session):
    print("\nClearing existing data...")
    session.run("MATCH (n) DETACH DELETE n")
    print("  Done.")


def create_constraints(session):
    print("\nCreating constraints...")
    constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (u:User)       REQUIRE u.user_id    IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Movie)      REQUIRE m.movie_id   IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (g:Genre)      REQUIRE g.name       IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (a:AgeGroup)   REQUIRE a.label      IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (o:Occupation) REQUIRE o.name       IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (gd:Gender)    REQUIRE gd.label     IS UNIQUE",
    ]
    for c in constraints:
        session.run(c)
    print("  Done.")


def import_genres(session, movies):
    print("\nImporting Genre nodes...")
    all_genres = set()
    for genres_str in movies["genres"]:
        for g in genres_str.split("|"):
            all_genres.add(g.strip())

    for genre in all_genres:
        session.run("MERGE (:Genre {name: $name})", name=genre)
    print(f"  {len(all_genres)} genres imported.")


def import_movies(session, movies):
    print("\nImporting Movie nodes + IN_GENRE relationships...")
    batch = []
    for _, row in movies.iterrows():
        batch.append({
            "movie_id": int(row["movie_id"]),
            "title"   : row["title"],
            "genres"  : [g.strip() for g in row["genres"].split("|")]
        })

    # Batch import movies
    session.run("""
        UNWIND $batch AS m
        MERGE (movie:Movie {movie_id: m.movie_id})
        SET movie.title = m.title
    """, batch=batch)

    # Create IN_GENRE relationships
    session.run("""
        UNWIND $batch AS m
        MATCH (movie:Movie {movie_id: m.movie_id})
        UNWIND m.genres AS gname
        MATCH (g:Genre {name: gname})
        MERGE (movie)-[:IN_GENRE]->(g)
    """, batch=batch)

    print(f"  {len(movies)} movies imported.")


def import_users(session, users):
    print("\nImporting User nodes + demographic relationships...")

    # Create AgeGroup, Gender, Occupation nodes
    for age_val, label in AGE_MAP.items():
        session.run("MERGE (:AgeGroup {label: $label, value: $value})",
                    label=label, value=age_val)

    for occ_val, name in OCCUPATION_MAP.items():
        session.run("MERGE (:Occupation {name: $name, value: $value})",
                    name=name, value=occ_val)

    session.run("MERGE (:Gender {label: 'Male'})")
    session.run("MERGE (:Gender {label: 'Female'})")

    # Import users in batches of 500
    BATCH_SIZE = 500
    user_list = users.to_dict("records")

    for i in range(0, len(user_list), BATCH_SIZE):
        batch = []
        for row in user_list[i:i+BATCH_SIZE]:
            batch.append({
                "user_id"   : int(row["user_id"]),
                "gender"    : "Male" if row["gender"] == "M" else "Female",
                "age_label" : AGE_MAP.get(int(row["age"]), "Unknown"),
                "occ_name"  : OCCUPATION_MAP.get(int(row["occupation"]), "other")
            })

        session.run("""
            UNWIND $batch AS u
            MERGE (user:User {user_id: u.user_id})
            SET user.gender = u.gender
            WITH user, u
            MATCH (g:Gender {label: u.gender})
            MERGE (user)-[:HAS_GENDER]->(g)
            WITH user, u
            MATCH (a:AgeGroup {label: u.age_label})
            MERGE (user)-[:HAS_AGE]->(a)
            WITH user, u
            MATCH (o:Occupation {name: u.occ_name})
            MERGE (user)-[:HAS_OCCUPATION]->(o)
        """, batch=batch)

    print(f"  {len(users)} users imported.")


def import_ratings(session, ratings):
    print("\nImporting RATED relationships...")
    BATCH_SIZE = 1000
    rating_list = ratings.to_dict("records")
    total = len(rating_list)

    for i in range(0, total, BATCH_SIZE):
        batch = [
            {
                "user_id" : int(r["user_id"]),
                "movie_id": int(r["movie_id"]),
                "rating"  : float(r["rating"])
            }
            for r in rating_list[i:i+BATCH_SIZE]
        ]
        session.run("""
            UNWIND $batch AS r
            MATCH (u:User  {user_id : r.user_id})
            MATCH (m:Movie {movie_id: r.movie_id})
            MERGE (u)-[rel:RATED]->(m)
            SET rel.rating = r.rating
        """, batch=batch)

        if (i // BATCH_SIZE) % 10 == 0:
            print(f"  Progress: {min(i+BATCH_SIZE, total):,}/{total:,}")

    print(f"  {total:,} RATED relationships imported.")


def print_summary(session):
    print("\n" + "="*50)
    print("GRAPH SUMMARY")
    print("="*50)
    result = session.run("""
        MATCH (n)
        RETURN labels(n)[0] AS label, count(n) AS count
        ORDER BY count DESC
    """)
    for record in result:
        print(f"  {record['label']:<15}: {record['count']:>8,} nodes")

    print()
    result = session.run("""
        MATCH ()-[r]->()
        RETURN type(r) AS rel_type, count(r) AS count
        ORDER BY count DESC
    """)
    for record in result:
        print(f"  {record['rel_type']:<20}: {record['count']:>8,} relationships")
    print("="*50)


# ============================================================
# MAIN
# ============================================================
def main():
    print("="*50)
    print("Neo4j ML-1M Knowledge Graph Import")
    print("="*50)

    # Load data
    ratings, movies, users = load_data()

    # Connect to Neo4j
    print(f"\nConnecting to {NEO4J_URI}...")
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    try:
        driver.verify_connectivity()
        print("  Connected!")
    except Exception as e:
        print(f"  Connection failed: {e}")
        print("  Make sure Neo4j Desktop is running and password is correct.")
        return

    with driver.session() as session:
        clear_database(session)
        create_constraints(session)
        import_genres(session, movies)
        import_movies(session, movies)
        import_users(session, users)
        import_ratings(session, ratings)
        print_summary(session)

    driver.close()
    print("\nImport complete!")
    print("\nOpen Neo4j Browser and run:")
    print("  CALL db.schema.visualization()")
    print("  MATCH (u:User)-[:RATED]->(m:Movie) RETURN u,m LIMIT 50")


if __name__ == "__main__":
    main()