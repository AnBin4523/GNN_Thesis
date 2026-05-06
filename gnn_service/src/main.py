import json
import hashlib
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from model        import get_registry, device
from recommend    import get_topk, get_topk_all_models, map_genre_to_user
from neo4j_client import (
    get_user_info, get_user_rated_movies,
    get_movie_info, get_movies_batch,
    get_user_subgraph, get_graph_stats, close_driver,
)
from mysql_client import (
    get_movie_metadata, get_movies_metadata_batch,
    get_web_user_by_email,
    create_web_user, update_ml1m_user_id,
    search_movies, get_movies_by_genre, _get_conn,
    upsert_rating, delete_rating,
    get_user_rating, get_movie_rating_stats,
    get_user_rated_movies as get_web_user_rated_movies,
)
from schemas import (
    RecommendItem, RecommendResponse, CompareResponse,
    UserInfo, WebUserResponse, RegisterRequest, LoginRequest, LoginResponse,
    SubgraphResponse, MetricsResponse, ModelMetrics,
    PatiencePoint, PatienceSensitivityResponse,
    MovieDetail, HealthResponse,
)

RESULT_DIR = Path(__file__).resolve().parent.parent.parent / "gnn_training" / "results"


# ============================================================
# LIFESPAN
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    get_registry()
    yield
    close_driver()


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
    movie_ids  = [item["movie_id"] for item in items if item["movie_id"]]
    neo4j_info = get_movies_batch(movie_ids)
    mysql_info = get_movies_metadata_batch(movie_ids)

    # Batch fetch rating stats
    rating_stats = {}
    for mid in movie_ids:
        rating_stats[mid] = get_movie_rating_stats(mid)

    result = []
    for item in items:
        mid   = item["movie_id"]
        neo4j = neo4j_info.get(mid, {})
        mysql = mysql_info.get(mid, {})
        stats = rating_stats.get(mid, {})
        result.append(RecommendItem(
            rank         = item["rank"],
            movie_id     = mid,
            title        = neo4j.get("title") or mysql.get("title"),
            genres       = neo4j.get("genres") or [],
            poster_path  = mysql.get("poster_path"),
            score        = item["score"],
            avg_rating   = stats.get("avg_rating"),
            total_ratings= stats.get("total_ratings", 0),
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
    user_idx : int,
    model    : str = Query("lightgcn", enum=["mf", "ngcf", "lightgcn"]),
    k        : int = Query(10, ge=1, le=50),
):
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
# USERS
# ============================================================

@app.get("/users/web/{user_id}/ratings", tags=["Users"])
def get_web_user_ratings(user_id: int, limit: int = Query(20, ge=1, le=100)):
    """Get web user's rating history with movie metadata."""
    rated = get_web_user_rated_movies(user_id)
    if not rated:
        return []
    # Enrich with movie metadata
    movie_ids  = [r["movie_id"] for r in rated[:limit]]
    mysql_info = get_movies_metadata_batch(movie_ids)
    result = []
    for r in rated[:limit]:
        mid   = r["movie_id"]
        movie = mysql_info.get(mid, {})
        result.append({
            "movie_id"  : mid,
            "title"     : movie.get("title"),
            "poster_path": movie.get("poster_path"),
            "genres"    : movie.get("genres"),
            "rating"    : r["rating"],
            "rated_at"  : r["rated_at"].isoformat() if r.get("rated_at") else None,
        })
    return result



@app.get("/users/{ml1m_user_id}", response_model=UserInfo, tags=["Users"])
def get_user(ml1m_user_id: int):
    info = get_user_info(ml1m_user_id)
    if info is None:
        raise HTTPException(404, f"User {ml1m_user_id} not found in Neo4j")
    return UserInfo(**info)


@app.get("/users/{ml1m_user_id}/rated", tags=["Users"])
def get_user_rated(ml1m_user_id: int, limit: int = Query(20, ge=1, le=100)):
    movies = get_user_rated_movies(ml1m_user_id, limit=limit)
    if not movies:
        raise HTTPException(404, f"No rated movies found for user {ml1m_user_id}")
    return movies


# ============================================================
# MOVIES
# ============================================================

@app.get("/movies/search", tags=["Movies"])
def search(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=100)):
    return search_movies(q, limit=limit)


@app.get("/movies/{movie_id}", response_model=MovieDetail, tags=["Movies"])
def get_movie(movie_id: int):
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
        trailer_key    = mysql.get("trailer_key"), 
    )


@app.get("/movies", tags=["Movies"])
def list_movies(
    genre  : str = Query(None),
    limit  : int = Query(20, ge=1, le=100),
    offset : int = Query(0, ge=0),
):
    return get_movies_by_genre(genre, limit=limit, offset=offset)


# ============================================================
# GRAPH
# ============================================================

@app.get("/graph/user/{ml1m_user_id}", response_model=SubgraphResponse, tags=["Graph"])
def get_subgraph(
    ml1m_user_id : int,
    movie_limit  : int = Query(10, ge=1, le=30),
):
    subgraph = get_user_subgraph(ml1m_user_id, movie_limit=movie_limit)
    if not subgraph["nodes"]:
        raise HTTPException(404, f"User {ml1m_user_id} not found in Neo4j")
    return SubgraphResponse(**subgraph)


@app.get("/graph/stats", tags=["Graph"])
def graph_stats():
    return get_graph_stats()


# ============================================================
# METRICS
# ============================================================

@app.get("/metrics", response_model=MetricsResponse, tags=["Metrics"])
def get_metrics():
    results_path = RESULT_DIR / "results.json"
    if not results_path.exists():
        raise HTTPException(404, "results.json not found")
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


@app.get("/metrics/patience", response_model=PatienceSensitivityResponse, tags=["Metrics"])
def get_patience_metrics():
    path = RESULT_DIR / "patience_sensitivity.json"
    if not path.exists():
        raise HTTPException(404, "patience_sensitivity.json not found")
    with open(path) as f:
        data = json.load(f)

    def _parse(d: dict) -> ModelMetrics:
        return ModelMetrics(
            precision_at_10 = d.get("Precision@10", 0),
            recall_at_10    = d.get("Recall@10",    0),
            ndcg_at_10      = d.get("NDCG@10",      0),
        )

    points = []
    for p_str in sorted(data.keys(), key=int):
        d = data[p_str]
        points.append(PatiencePoint(
            patience = int(p_str),
            mf       = _parse(d.get("MF",       {})),
            ngcf     = _parse(d.get("NGCF",     {})),
            lightgcn = _parse(d.get("LightGCN", {})),
        ))
    return PatienceSensitivityResponse(points=points)


# ============================================================
# AUTH
# ============================================================

@app.post("/auth/register", response_model=WebUserResponse, tags=["Auth"])
def register(req: RegisterRequest):
    existing = get_web_user_by_email(req.email)
    if existing:
        raise HTTPException(400, "Email already registered")

    # preferred_genres empty at register → will be set in onboarding
    ml1m_user_id     = 0
    preferred_genres = ""
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
    user = get_web_user_by_email(req.email)
    if user is None or user["password_hash"] != _hash_password(req.password):
        raise HTTPException(401, "Invalid email or password")

    token = hashlib.sha256(
        (req.email + user["password_hash"]).encode()
    ).hexdigest()

    return LoginResponse(
        user_id          = user["user_id"],
        display_name     = user["display_name"],
        ml1m_user_id     = user["ml1m_user_id"],
        preferred_genres = user["preferred_genres"],  # empty = not onboarded
        token            = token,
    )


# ============================================================
# AUTH — UPDATE GENRES (onboarding)
# ============================================================

class UpdateGenresRequest(BaseModel):
    user_id          : int
    preferred_genres : list[str]


@app.put("/auth/update-genres", tags=["Auth"])
def update_genres(req: UpdateGenresRequest):
    ml1m_user_id     = map_genre_to_user(req.preferred_genres)
    preferred_genres = ",".join(req.preferred_genres)

    update_ml1m_user_id(req.user_id, ml1m_user_id)

    conn = _get_conn()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET preferred_genres = %s WHERE user_id = %s",
            (preferred_genres, req.user_id)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

    return {
        "ml1m_user_id"    : ml1m_user_id,
        "preferred_genres": preferred_genres,
    }

class RemapRequest(BaseModel):
    user_id: int


@app.post("/auth/remap", tags=["Auth"])
def remap_surrogate(req: RemapRequest):
    """
    Re-compute ML-1M surrogate mapping based on actual rating history.
    Requires >= 10 rated movies; otherwise returns current mapping unchanged.
    """
    from recommend import map_rating_to_user
    rated = get_web_user_rated_movies(req.user_id)
    if len(rated) < 10:
        return {
            "ml1m_user_id"  : None,
            "mapping_source": "genre",
            "total_rated"   : len(rated),
        }
    new_ml1m_id = map_rating_to_user(rated)
    update_ml1m_user_id(req.user_id, new_ml1m_id)
    return {
        "ml1m_user_id"  : new_ml1m_id,
        "mapping_source": "rating",
        "total_rated"   : len(rated),
    }


# ============================================================
# RATINGS
# ============================================================

class RatingRequest(BaseModel):
    rating: int  # 1-5


@app.put("/ratings/{movie_id}", tags=["Ratings"])
def rate_movie(movie_id: int, req: RatingRequest, user_id: int = Query(...)):
    """
    Submit or update a rating (1-5) for a movie.
    After rating, re-evaluate surrogate mapping if user has rated >= 10 movies.
    """
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Check movie exists
    movie = get_movie_metadata(movie_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    # Save rating
    upsert_rating(user_id, movie_id, req.rating)

    # Check if enough ratings to switch to rating-based mapping
    rated = get_web_user_rated_movies(user_id)
    mapping_source = "genre"
    new_ml1m_id = None

    if len(rated) >= 10:
        try:
            from recommend import map_rating_to_user
            new_ml1m_id = map_rating_to_user(rated)
            update_ml1m_user_id(user_id, new_ml1m_id)
            mapping_source = "rating"
        except Exception:
            pass  # mapping fails silently — rating is already saved
    
    return {
        "movie_id"      : movie_id,
        "rating"        : req.rating,
        "total_rated"   : len(rated),
        "mapping_source": mapping_source,
        "ml1m_user_id"  : new_ml1m_id,
    }


@app.delete("/ratings/{movie_id}", tags=["Ratings"])
def unrate_movie(movie_id: int, user_id: int = Query(...)):
    """Remove a rating."""
    delete_rating(user_id, movie_id)
    return {"movie_id": movie_id, "status": "removed"}


@app.get("/ratings/{movie_id}", tags=["Ratings"])
def get_rating(movie_id: int, user_id: int = Query(...)):
    """
    Get current user's rating for a movie + community stats.
    Returns: { user_rating, avg_rating, total_ratings }
    """
    user_rating = get_user_rating(user_id, movie_id)
    stats       = get_movie_rating_stats(movie_id)
    return {
        "movie_id"    : movie_id,
        "user_rating" : user_rating,
        "avg_rating"  : stats["avg_rating"],
        "total_ratings": stats["total_ratings"],
    }