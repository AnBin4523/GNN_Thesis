import numpy as np
import torch
from model import get_registry, device


def get_topk(
    model_name: str,
    user_idx: int,
    k: int = 10,
    exclude_seen: bool = True,
) -> list[dict]:
    """
    Generate Top-K movie recommendations for a given ML-1M user index.
    """
    registry = get_registry()
    model    = registry.get(model_name)

    user_tensor = torch.tensor([user_idx], dtype=torch.long).to(device)

    model.eval()
    with torch.no_grad():
        scores = model.get_scores(user_tensor, registry.num_movies)[0].cpu().numpy()

    if exclude_seen:
        for movie_idx in registry.train_user_items.get(user_idx, set()):
            if movie_idx < registry.num_movies:
                scores[movie_idx] = -np.inf

    top_indices = np.argsort(scores)[::-1][:k].tolist()

    results = []
    for rank, movie_idx in enumerate(top_indices, start=1):
        movie_id = registry.idx2movie.get(movie_idx)
        results.append({
            "rank"      : rank,
            "movie_idx" : int(movie_idx),
            "movie_id"  : int(movie_id) if movie_id is not None else None,
            "score"     : float(scores[movie_idx]),
        })

    return results


def get_topk_all_models(
    user_idx: int,
    k: int = 10,
    exclude_seen: bool = True,
) -> dict[str, list[dict]]:
    """
    Run Top-K for all 3 models at once.
    """
    return {
        model_name: get_topk(model_name, user_idx, k, exclude_seen)
        for model_name in ["mf", "ngcf", "lightgcn"]
    }


def map_rating_to_user(rated: list[dict]) -> int:
    """
    Map a web user's rating history to the closest ML-1M user index.

    Strategy: Jaccard similarity on the set of rated movie indices.
    score = |overlap| / |union|  (higher = more similar taste)

    Args:
        rated : [{"movie_id": int, "rating": int, ...}, ...]

    Returns:
        user_idx (int) — best matching ML-1M user index
    """
    registry = get_registry()

    user_movie_set = set()
    for r in rated:
        idx = registry.movie2idx.get(r["movie_id"])
        if idx is not None:
            user_movie_set.add(idx)

    if not user_movie_set:
        return 0

    best_user_idx = 0
    best_score    = -1.0

    for ml1m_user_idx, ml1m_movies in registry.train_user_items.items():
        if not ml1m_movies:
            continue
        overlap = len(user_movie_set & ml1m_movies)
        if overlap == 0:
            continue
        score = overlap / len(user_movie_set | ml1m_movies)
        if score > best_score:
            best_score    = score
            best_user_idx = ml1m_user_idx

    return best_user_idx


def map_genre_to_user(preferred_genres: list[str]) -> int:
    """
    Map a web user's preferred genres to the closest ML-1M user index.

    Strategy: compute genre overlap ratio per user — normalize by number
    of movies rated to avoid bias toward heavy raters.

    Score = (genre overlap count) / (total movies rated by user)

    Args:
        preferred_genres : e.g. ["Action", "Comedy"]

    Returns:
        user_idx (int) — best matching ML-1M user index
    """
    import pandas as pd
    from pathlib import Path

    if not preferred_genres:
        return 0

    registry = get_registry()
    DATA_DIR = Path(__file__).resolve().parent.parent.parent / "gnn_training" / "data" / "ml-1m"

    movies_df = pd.read_csv(
        DATA_DIR / "movies.dat",
        sep="::", engine="python",
        names=["movie_id", "title", "genres"],
        encoding="latin-1",
    )

    # Build movie_idx → set of genres
    movie_genre_map: dict[int, set] = {}
    for _, row in movies_df.iterrows():
        idx = registry.movie2idx.get(row["movie_id"])
        if idx is not None:
            movie_genre_map[idx] = set(row["genres"].split("|"))

    preferred_set = set(g.strip() for g in preferred_genres)

    best_user_idx = 0
    best_score    = -1.0

    for user_idx, movie_set in registry.train_user_items.items():
        if len(movie_set) == 0:
            continue

        # Count how many movies match preferred genres
        overlap = sum(
            1 for m in movie_set
            if movie_genre_map.get(m, set()) & preferred_set
        )

        # Normalize by total movies rated → genre ratio (0.0 to 1.0)
        score = overlap / len(movie_set)

        if score > best_score:
            best_score    = score
            best_user_idx = user_idx

    return best_user_idx