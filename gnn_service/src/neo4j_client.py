import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "anbin4523")

# ============================================================
# DRIVER  (singleton)
# ============================================================
_driver = None

def get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver

def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


# ============================================================
# USER QUERIES
# ============================================================

def get_user_info(ml1m_user_id: int) -> dict | None:
    """
    Get demographic info of a ML-1M user from Neo4j.
    Returns: { user_id, gender, age, occupation, num_rated }
    """
    query = """
    MATCH (u:User {user_id: $user_id})
    OPTIONAL MATCH (u)-[:HAS_GENDER]->(g:Gender)
    OPTIONAL MATCH (u)-[:HAS_AGE]->(a:AgeGroup)
    OPTIONAL MATCH (u)-[:HAS_OCCUPATION]->(o:Occupation)
    OPTIONAL MATCH (u)-[r:RATED]->()
    RETURN
        u.user_id   AS user_id,
        g.label     AS gender,
        a.label     AS age,
        o.name      AS occupation,
        count(r)    AS num_rated
    """
    with get_driver().session() as session:
        result = session.run(query, user_id=ml1m_user_id)
        record = result.single()
        if record is None:
            return None
        return {
            "user_id"   : record["user_id"],
            "gender"    : record["gender"],
            "age"       : record["age"],
            "occupation": record["occupation"],
            "num_rated" : record["num_rated"],
        }


def get_user_rated_movies(ml1m_user_id: int, limit: int = 20) -> list[dict]:
    """
    Get movies rated by a user (rating >= 4), ordered by rating desc.
    Returns: [{ movie_id, title, genres, rating }, ...]
    """
    query = """
    MATCH (u:User {user_id: $user_id})-[r:RATED]->(m:Movie)
    WHERE r.rating >= 4
    OPTIONAL MATCH (m)-[:IN_GENRE]->(g:Genre)
    WITH m, r, collect(g.name) AS genres
    RETURN
        m.movie_id  AS movie_id,
        m.title     AS title,
        genres,
        r.rating    AS rating
    ORDER BY r.rating DESC
    LIMIT $limit
    """
    with get_driver().session() as session:
        result = session.run(query, user_id=ml1m_user_id, limit=limit)
        return [
            {
                "movie_id": record["movie_id"],
                "title"   : record["title"],
                "genres"  : record["genres"],
                "rating"  : record["rating"],
            }
            for record in result
        ]


# ============================================================
# MOVIE QUERIES
# ============================================================

def get_movie_info(ml1m_movie_id: int) -> dict | None:
    """
    Get movie info from Neo4j.
    Returns: { movie_id, title, genres }
    """
    query = """
    MATCH (m:Movie {movie_id: $movie_id})
    OPTIONAL MATCH (m)-[:IN_GENRE]->(g:Genre)
    WITH m, collect(g.name) AS genres
    RETURN
        m.movie_id  AS movie_id,
        m.title     AS title,
        genres
    """
    with get_driver().session() as session:
        result = session.run(query, movie_id=ml1m_movie_id)
        record = result.single()
        if record is None:
            return None
        return {
            "movie_id": record["movie_id"],
            "title"   : record["title"],
            "genres"  : record["genres"],
        }


def get_movies_batch(ml1m_movie_ids: list[int]) -> dict[int, dict]:
    """
    Get info for multiple movies in one query.
    Returns: { movie_id: { movie_id, title, genres }, ... }
    """
    query = """
    MATCH (m:Movie)
    WHERE m.movie_id IN $movie_ids
    OPTIONAL MATCH (m)-[:IN_GENRE]->(g:Genre)
    WITH m, collect(g.name) AS genres
    RETURN
        m.movie_id  AS movie_id,
        m.title     AS title,
        genres
    """
    with get_driver().session() as session:
        result = session.run(query, movie_ids=ml1m_movie_ids)
        return {
            record["movie_id"]: {
                "movie_id": record["movie_id"],
                "title"   : record["title"],
                "genres"  : record["genres"],
            }
            for record in result
        }


# ============================================================
# SUBGRAPH FOR VISUALIZATION
# ============================================================

def get_user_subgraph(ml1m_user_id: int, movie_limit: int = 10) -> dict:
    """
    Get a subgraph centered on a user for frontend graph visualization.
    Includes: User -> Demographics + rated Movies -> Genres

    Returns:
    {
        "nodes": [{ "id", "label", "type", "properties" }, ...],
        "edges": [{ "source", "target", "type" }, ...]
    }
    """
    user_info    = get_user_info(ml1m_user_id)
    if user_info is None:
        return {"nodes": [], "edges": []}

    rated_movies = get_user_rated_movies(ml1m_user_id, limit=movie_limit)

    nodes      = []
    edges      = []
    seen_nodes = set()

    # User node
    user_node_id = f"user_{ml1m_user_id}"
    nodes.append({
        "id"        : user_node_id,
        "label"     : f"User {ml1m_user_id}",
        "type"      : "User",
        "properties": {
            "gender"    : user_info["gender"],
            "age"       : user_info["age"],
            "occupation": user_info["occupation"],
            "num_rated" : user_info["num_rated"],
        },
    })
    seen_nodes.add(user_node_id)

    # Demographic nodes
    for node_type, value, rel_type in [
        ("Gender",     user_info["gender"],    "HAS_GENDER"),
        ("AgeGroup",   user_info["age"],        "HAS_AGE"),
        ("Occupation", user_info["occupation"], "HAS_OCCUPATION"),
    ]:
        if value:
            node_id = f"{node_type.lower()}_{value}"
            if node_id not in seen_nodes:
                nodes.append({
                    "id"        : node_id,
                    "label"     : value,
                    "type"      : node_type,
                    "properties": {},
                })
                seen_nodes.add(node_id)
            edges.append({"source": user_node_id, "target": node_id, "type": rel_type})

    # Movie nodes + Genre nodes
    for movie in rated_movies:
        if movie["movie_id"] is None:
            continue
        movie_node_id = f"movie_{movie['movie_id']}"
        if movie_node_id not in seen_nodes:
            nodes.append({
                "id"        : movie_node_id,
                "label"     : movie["title"] or f"Movie {movie['movie_id']}",
                "type"      : "Movie",
                "properties": {
                    "movie_id": movie["movie_id"],
                    "rating"  : movie["rating"],
                },
            })
            seen_nodes.add(movie_node_id)
        edges.append({"source": user_node_id, "target": movie_node_id, "type": "RATED"})

        for genre_name in movie["genres"]:
            genre_node_id = f"genre_{genre_name}"
            if genre_node_id not in seen_nodes:
                nodes.append({
                    "id"        : genre_node_id,
                    "label"     : genre_name,
                    "type"      : "Genre",
                    "properties": {},
                })
                seen_nodes.add(genre_node_id)
            edges.append({"source": movie_node_id, "target": genre_node_id, "type": "IN_GENRE"})

    return {"nodes": nodes, "edges": edges}


# ============================================================
# STATS
# ============================================================

def get_graph_stats() -> dict:
    """Return overall graph statistics from Neo4j."""
    query = """
    MATCH (u:User)   WITH count(u) AS users
    MATCH (m:Movie)  WITH users, count(m) AS movies
    MATCH (g:Genre)  WITH users, movies, count(g) AS genres
    MATCH ()-[r:RATED]->() WITH users, movies, genres, count(r) AS ratings
    RETURN users, movies, genres, ratings
    """
    with get_driver().session() as session:
        result = session.run(query)
        record = result.single()
        if record is None:
            return {}
        return {
            "num_users"  : record["users"],
            "num_movies" : record["movies"],
            "num_genres" : record["genres"],
            "num_ratings": record["ratings"],
        }