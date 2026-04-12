import json
import hashlib
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from model         import get_registry, device
from recommend     import get_topk, get_topk_all_models, map_genre_to_user
from neo4j_client  import (
    get_user_info, get_user_rated_movies,
    get_movie_info, get_movies_batch,
    get_user_subgraph, get_graph_stats, close_driver,
)
from mysql_client  import (
    get_movie_metadata, get_movies_metadata_batch,
    get_web_user_by_email, get_web_user_by_id,
    create_web_user, search_movies, get_movies_by_genre,
)
from schemas import (
    RecommendItem, RecommendResponse, CompareResponse,
    UserInfo, WebUserResponse, RegisterRequest, LoginRequest, LoginResponse,
    SubgraphResponse, MetricsResponse, ModelMetrics,
    MovieDetail, HealthResponse,
)

RESULT_DIR = Path(__file__).resolve().parent.parent.parent / "gnn_training" / "results"


# ============================================================
# LIFESPAN — load models once at startup
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    get_registry()   # loads ML-1M data + all 3 checkpoints
    yield
    close_driver()   # close Neo4j driver on shutdown


# ============================================================
# APP
# ============================================================
app = FastAPI(
    title       = "GNN Movie Recommendation API",
    description = "Thesis: Intelligent Movie Recommendation System using GNN — Ngo Le Thien An | ITITWE21117",
    version     = "1.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ============================================================
# HELPERS
# ============================================================

def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _enrich_recommendations(items: list[dict]) -> list[RecommendItem]:
    """Attach title + poster_path + genres to raw recommend output."""
    movie_ids   = [item["movie_id"] for item in items if item["movie_id"]]
    neo4j_info  = get_movies_batch(movie_ids)       # { movie_id: {title, genres} }
    mysql_info  = get_movies_metadata_batch(movie_ids)  # { movie_id: {poster_path, ...} }

    result = []
    for item in items:
        mid      = item["movie_id"]
        neo4j    = neo4j_info.get(mid, {})
        mysql    = mysql_info.get(mid, {})
        result.append(RecommendItem(
            rank        = item["rank"],
            movie_id    = mid,
            title       = neo4j.get("title") or mysql.get("title"),
            genres      = neo4j.get("genres") or [],
            poster_path = mysql.get("poster_path"),
            score       = item["score"],
        ))
    return result


# ============================================================
# HEALTH
# ============================================================

@app.get("/health", response_model=HealthResponse, tags=["General"])
def health():
    registry = get_registry()
    return HealthResponse(
        status = "ok",
        models = registry.available_models(),
        device = str(device),
    )


# ============================================================
# RECOMMENDATIONS
# ============================================================

@app.get("/recommend/{user_idx}", response_model=RecommendResponse, tags=["Recommendations"])
def recommend(
    user_idx   : int,
    model      : str = Query("lightgcn", enum=["mf", "ngcf", "lightgcn"]),
    k          : int = Query(10, ge=1, le=50),
):
    """
    Get Top-K movie recommendations for a ML-1M user index.
    - **user_idx**: internal user index (0-based, 0 to 6039)
    - **model**: mf | ngcf | lightgcn (default: lightgcn)
    - **k**: number of recommendations (default: 10)
    """
    registry = get_registry()
    if user_idx < 0 or user_idx >= registry.num_users:
        raise HTTPException(400, f"user_idx must be between 0 and {registry.num_users - 1}")

    raw_items = get_topk(model, user_idx, k)
    items     = _enrich_recommendations(raw_items)

    return RecommendResponse(model=model, user_idx=user_idx, k=k, items=items)


@app.get("/recommend/compare/{user_idx}", response_model=CompareResponse, tags=["Recommendations"])
def recommend_compare(
    user_idx : int,
    k        : int = Query(10, ge=1, le=50),
):
    """
    Get Top-K recommendations from all 3 models side-by-side for comparison.
    """
    registry = get_registry()
    if user_idx < 0 or user_idx >= registry.num_users:
        raise HTTPException(400, f"user_idx must be between 0 and {registry.num_users - 1}")

    all_raw = get_topk_all_models(user_idx, k)

    return CompareResponse(
        user_idx = user_idx,
        k        = k,
        mf       = _enrich_recommendations(all_raw["mf"]),
        ngcf     = _enrich_recommendations(all_raw["ngcf"]),
        lightgcn = _enrich_recommendations(all_raw["lightgcn"]),
    )


# ============================================================
# USERS (ML-1M)
# ============================================================

@app.get("/users/{ml1m_user_id}", response_model=UserInfo, tags=["Users"])
def get_user(ml1m_user_id: int):
    """Get demographic info of a ML-1M user from Neo4j."""
    info = get_user_info(ml1m_user_id)
    if info is None:
        raise HTTPException(404, f"User {ml1m_user_id} not found in Neo4j")
    return UserInfo(**info)


@app.get("/users/{ml1m_user_id}/rated", tags=["Users"])
def get_user_rated(ml1m_user_id: int, limit: int = Query(20, ge=1, le=100)):
    """Get movies rated by a ML-1M user (rating >= 4)."""
    movies = get_user_rated_movies(ml1m_user_id, limit=limit)
    if not movies:
        raise HTTPException(404, f"No rated movies found for user {ml1m_user_id}")
    return movies


# ============================================================
# MOVIES
# ============================================================

@app.get("/movies/search", tags=["Movies"])
def search(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=100)):
    """Search movies by title."""
    return search_movies(q, limit=limit)


@app.get("/movies/{movie_id}", response_model=MovieDetail, tags=["Movies"])
def get_movie(movie_id: int):
    """Get full movie detail (MySQL metadata + Neo4j genres)."""
    mysql = get_movie_metadata(movie_id)
    if mysql is None:
        raise HTTPException(404, f"Movie {movie_id} not found")
    neo4j = get_movie_info(movie_id) or {}
    return MovieDetail(
        movie_id       = movie_id,
        title          = mysql.get("title"),
        genres         = neo4j.get("genres") or mysql.get("genres"),
        year_published = mysql.get("year_published"),
        poster_path    = mysql.get("poster_path"),
        plot           = mysql.get("plot"),
        actors         = mysql.get("actors"),
        directors      = mysql.get("directors"),
        tmdb_id        = mysql.get("tmdb_id"),
    )


@app.get("/movies", tags=["Movies"])
def list_movies(
    genre  : str = Query(None),
    limit  : int = Query(20, ge=1, le=100),
    offset : int = Query(0, ge=0),
):
    """List movies, optionally filtered by genre."""
    if genre:
        return get_movies_by_genre(genre, limit=limit, offset=offset)
    # Return all (paginated)
    from mysql_client import _get_conn
    conn = _get_conn()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT movie_id, title, year_published, genres, poster_path "
            "FROM movies ORDER BY title LIMIT %s OFFSET %s",
            (limit, offset)
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


# ============================================================
# GRAPH VISUALIZATION
# ============================================================

@app.get("/graph/user/{ml1m_user_id}", response_model=SubgraphResponse, tags=["Graph"])
def get_subgraph(
    ml1m_user_id : int,
    movie_limit  : int = Query(10, ge=1, le=30),
):
    """
    Get subgraph for a ML-1M user — nodes + edges for frontend visualization.
    Includes: User → Demographics + top rated Movies → Genres
    """
    subgraph = get_user_subgraph(ml1m_user_id, movie_limit=movie_limit)
    if not subgraph["nodes"]:
        raise HTTPException(404, f"User {ml1m_user_id} not found in Neo4j")
    return SubgraphResponse(**subgraph)


@app.get("/graph/stats", tags=["Graph"])
def graph_stats():
    """Return overall Neo4j graph statistics."""
    return get_graph_stats()


# ============================================================
# METRICS
# ============================================================

@app.get("/metrics", response_model=MetricsResponse, tags=["Metrics"])
def get_metrics():
    """Return evaluation metrics (Precision@10, Recall@10, NDCG@10) for all 3 models."""
    results_path = RESULT_DIR / "results.json"
    if not results_path.exists():
        raise HTTPException(404, "results.json not found — run train.py first")

    with open(results_path) as f:
        data = json.load(f)

    def _parse(model_key: str) -> ModelMetrics:
        d = data.get(model_key, {})
        return ModelMetrics(
            precision_at_10 = d.get("Precision@10", 0),
            recall_at_10    = d.get("Recall@10",    0),
            ndcg_at_10      = d.get("NDCG@10",      0),
        )

    return MetricsResponse(
        mf       = _parse("Matrix Factorization"),
        ngcf     = _parse("NGCF"),
        lightgcn = _parse("LightGCN"),
    )


# ============================================================
# AUTH (simple — no JWT, use session on frontend)
# ============================================================

@app.post("/auth/register", response_model=WebUserResponse, tags=["Auth"])
def register(req: RegisterRequest):
    """Register a new web user and map to closest ML-1M user by preferred genres."""
    # Check duplicate email
    existing = get_web_user_by_email(req.email)
    if existing:
        raise HTTPException(400, "Email already registered")

    # Map preferred genres → ML-1M user index
    ml1m_user_id     = map_genre_to_user(req.preferred_genres)
    preferred_genres = ",".join(req.preferred_genres)
    password_hash    = _hash_password(req.password)

    new_id = create_web_user(
        email            = req.email,
        password_hash    = password_hash,
        display_name     = req.display_name,
        preferred_genres = preferred_genres,
        ml1m_user_id     = ml1m_user_id,
    )
    return WebUserResponse(
        user_id          = new_id,
        email            = req.email,
        display_name     = req.display_name,
        preferred_genres = preferred_genres,
        ml1m_user_id     = ml1m_user_id,
    )


@app.post("/auth/login", response_model=LoginResponse, tags=["Auth"])
def login(req: LoginRequest):
    """Login with email + password. Returns user info + simple token."""
    user = get_web_user_by_email(req.email)
    if user is None or user["password_hash"] != _hash_password(req.password):
        raise HTTPException(401, "Invalid email or password")

    # Simple token: sha256(email + password_hash)
    token = hashlib.sha256(
        (req.email + user["password_hash"]).encode()
    ).hexdigest()

    return LoginResponse(
        user_id      = user["user_id"],
        display_name = user["display_name"],
        ml1m_user_id = user["ml1m_user_id"],
        token        = token,
    )