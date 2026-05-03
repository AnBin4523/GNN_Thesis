from pydantic import BaseModel
from typing import Optional


# ============================================================
# MOVIE SCHEMAS
# ============================================================

class MovieBase(BaseModel):
    movie_id : int
    title    : str
    genres   : Optional[str | list[str]] = None


class MovieDetail(MovieBase):
    year_published : Optional[int] = None
    poster_path    : Optional[str] = None
    plot           : Optional[str] = None
    actors         : Optional[str] = None
    directors      : Optional[str] = None
    tmdb_id        : Optional[int] = None
    trailer_key    : Optional[str] = None

# ============================================================
# RECOMMENDATION SCHEMAS
# ============================================================

class RecommendItem(BaseModel):
    rank          : int
    movie_id      : int
    title         : Optional[str]       = None
    genres        : Optional[list[str]] = None
    poster_path   : Optional[str]       = None
    score         : float
    avg_rating    : Optional[float]     = None
    total_ratings : Optional[int]       = 0


class RecommendResponse(BaseModel):
    model    : str
    user_idx : int
    k        : int
    items    : list[RecommendItem]


class CompareResponse(BaseModel):
    user_idx : int
    k        : int
    mf       : list[RecommendItem]
    ngcf     : list[RecommendItem]
    lightgcn : list[RecommendItem]


# ============================================================
# USER SCHEMAS
# ============================================================

class UserInfo(BaseModel):
    user_id    : int
    gender     : Optional[str] = None
    age        : Optional[str] = None
    occupation : Optional[str] = None
    num_rated  : int


class WebUserResponse(BaseModel):
    user_id          : int
    email            : str
    display_name     : str
    preferred_genres : Optional[str] = None
    ml1m_user_id     : Optional[int] = None


class RegisterRequest(BaseModel):
    email            : str
    password         : str
    display_name     : str
    preferred_genres : list[str]


class LoginRequest(BaseModel):
    email    : str
    password : str


class LoginResponse(BaseModel):
    user_id          : int
    display_name     : str
    ml1m_user_id     : int
    preferred_genres : Optional[str] = None  # empty = not onboarded yet
    token            : str


# ============================================================
# GRAPH SCHEMAS
# ============================================================

class GraphNode(BaseModel):
    id         : str
    label      : str
    type       : str
    properties : dict = {}


class GraphEdge(BaseModel):
    source : str
    target : str
    type   : str


class SubgraphResponse(BaseModel):
    nodes : list[GraphNode]
    edges : list[GraphEdge]


# ============================================================
# METRICS SCHEMAS
# ============================================================

class ModelMetrics(BaseModel):
    precision_at_10 : float
    recall_at_10    : float
    ndcg_at_10      : float


class MetricsResponse(BaseModel):
    mf       : ModelMetrics
    ngcf     : ModelMetrics
    lightgcn : ModelMetrics


# ============================================================
# GENERAL
# ============================================================

class HealthResponse(BaseModel):
    status : str
    models : list[str]
    device : str