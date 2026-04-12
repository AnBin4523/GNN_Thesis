import os
import torch
import torch.nn as nn
import pandas as pd
import numpy as np
from torch_geometric.utils import degree
from pathlib import Path

# ============================================================
# DEVICE
# ============================================================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ============================================================
# PATHS  (gnn_service/src/ ../../gnn_training/)
# ============================================================
BASE_DIR      = Path(__file__).resolve().parent.parent.parent / "gnn_training"
DATA_DIR      = BASE_DIR / "data" / "ml-1m"
CKPT_DIR      = BASE_DIR / "checkpoints"

# ============================================================
# MODEL ARCHITECTURES (MF, NGCF, LightGCN)
# ============================================================

class MatrixFactorization(nn.Module):
    def __init__(self, num_users, num_movies, emb_dim=64):
        super().__init__()
        self.user_emb  = nn.Embedding(num_users,  emb_dim)
        self.movie_emb = nn.Embedding(num_movies, emb_dim)

    def get_scores(self, user_ids, num_movies):
        u = self.user_emb(user_ids)
        return u @ self.movie_emb.weight.T


class NGCFConv(nn.Module):
    def __init__(self, emb_dim, dropout=0.1):
        super().__init__()
        self.W1      = nn.Linear(emb_dim, emb_dim)
        self.W2      = nn.Linear(emb_dim, emb_dim)
        self.dropout = nn.Dropout(dropout)
        self.leaky   = nn.LeakyReLU(0.2)

    def forward(self, x, edge_index):
        row, col     = edge_index
        deg          = degree(col, x.size(0), dtype=x.dtype)
        deg_inv_sqrt = deg.pow(-0.5)
        deg_inv_sqrt[deg_inv_sqrt == float("inf")] = 0
        norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]

        agg = torch.zeros_like(x)
        msg = norm.unsqueeze(1) * (self.W1(x[col]) + self.W2(x[row] * x[col]))
        agg.scatter_add_(0, row.unsqueeze(1).expand_as(msg), msg)
        return self.leaky(self.dropout(agg))


class NGCF(nn.Module):
    def __init__(self, num_users, num_movies, emb_dim=64, n_layers=3, dropout=0.1):
        super().__init__()
        self.num_users  = num_users
        self.num_movies = num_movies
        self.embedding  = nn.Embedding(num_users + num_movies, emb_dim)
        self.convs      = nn.ModuleList([NGCFConv(emb_dim, dropout) for _ in range(n_layers)])

    def forward(self, edge_index):
        x        = self.embedding.weight
        all_embs = [x]
        for conv in self.convs:
            x = conv(x, edge_index)
            all_embs.append(x)
        return torch.cat(all_embs, dim=1)

    def get_scores(self, user_ids, num_movies):
        final     = self.forward(self._edge_index)
        user_emb  = final[user_ids]
        movie_emb = final[self.num_users : self.num_users + num_movies]
        return user_emb @ movie_emb.T

    def set_edge_index(self, edge_index):
        self._edge_index = edge_index


class LightGCN(nn.Module):
    def __init__(self, num_users, num_movies, emb_dim=64, n_layers=3):
        super().__init__()
        self.num_users  = num_users
        self.num_movies = num_movies
        self.n_layers   = n_layers
        self.embedding  = nn.Embedding(num_users + num_movies, emb_dim)

    def forward(self, edge_index):
        row, col  = edge_index
        num_nodes = self.num_users + self.num_movies
        deg       = torch.zeros(num_nodes, device=edge_index.device)
        deg.scatter_add_(0, col, torch.ones(col.size(0), device=edge_index.device))
        deg_inv_sqrt = deg.pow(-0.5)
        deg_inv_sqrt[deg_inv_sqrt == float("inf")] = 0
        norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]

        embs     = self.embedding.weight
        all_embs = [embs]
        for _ in range(self.n_layers):
            agg = torch.zeros_like(embs)
            agg.scatter_add_(
                0,
                col.unsqueeze(1).expand(-1, embs.size(1)),
                norm.unsqueeze(1) * embs[row],
            )
            embs = agg
            all_embs.append(embs)
        return torch.stack(all_embs, dim=0).mean(dim=0)

    def get_scores(self, user_ids, num_movies):
        final     = self.forward(self._edge_index)
        user_emb  = final[user_ids]
        movie_emb = final[self.num_users : self.num_users + num_movies]
        return user_emb @ movie_emb.T

    def set_edge_index(self, edge_index):
        self._edge_index = edge_index


# ============================================================
# DATASET LOADER  (build mappings + edge_index from ML-1M)
# ============================================================

def load_ml1m_data():
    """
    Load ML-1M ratings, build user/movie index mappings,
    and construct the bipartite edge_index for GNN models.
    Returns:
        train_df, num_users, num_movies,
        user2idx, movie2idx, idx2movie,
        train_user_items, edge_index
    """
    ratings = pd.read_csv(
        DATA_DIR / "ratings.dat",
        sep="::", engine="python",
        names=["user_id", "movie_id", "rating", "timestamp"],
        encoding="latin-1",
    )

    unique_users  = sorted(ratings["user_id"].unique())
    unique_movies = sorted(ratings["movie_id"].unique())

    user2idx  = {u: i for i, u in enumerate(unique_users)}
    movie2idx = {m: i for i, m in enumerate(unique_movies)}
    idx2movie = {i: m for m, i in movie2idx.items()}

    ratings["user_idx"]  = ratings["user_id"].map(user2idx)
    ratings["movie_idx"] = ratings["movie_id"].map(movie2idx)

    num_users  = len(unique_users)
    num_movies = len(unique_movies)

    # Positive interactions only (implicit feedback)
    pos_ratings = ratings[ratings["rating"] >= 4].copy()

    # Reproduce same train split as train.py (80/10/10 per user)
    train_list = []
    for _, group in pos_ratings.groupby("user_idx"):
        group  = group.sample(frac=1, random_state=42)
        n      = len(group)
        n_test = max(1, int(n * 0.1))
        n_val  = max(1, int(n * 0.1))
        train_list.append(group.iloc[n_test + n_val :])

    train_df         = pd.concat(train_list).reset_index(drop=True)
    train_user_items = train_df.groupby("user_idx")["movie_idx"].apply(set).to_dict()

    # Build bipartite edge_index (undirected: user→movie + movie→user)
    user_nodes  = torch.tensor(train_df["user_idx"].values,              dtype=torch.long)
    movie_nodes = torch.tensor(train_df["movie_idx"].values + num_users, dtype=torch.long)
    edge_index  = torch.stack([
        torch.cat([user_nodes, movie_nodes]),
        torch.cat([movie_nodes, user_nodes]),
    ], dim=0).to(device)

    return (
        train_df, num_users, num_movies,
        user2idx, movie2idx, idx2movie,
        train_user_items, edge_index,
    )


# ============================================================
# MODEL REGISTRY  (singleton — loaded once at startup)
# ============================================================

class ModelRegistry:
    """
    Loads all 3 model checkpoints once and keeps them in memory.
    Usage:
        registry = ModelRegistry()
        mf       = registry.get("mf")
        ngcf     = registry.get("ngcf")
        lightgcn = registry.get("lightgcn")
    """

    def __init__(self):
        print("Loading ML-1M data...")
        (
            self.train_df,
            self.num_users,
            self.num_movies,
            self.user2idx,
            self.movie2idx,
            self.idx2movie,
            self.train_user_items,
            self.edge_index,
        ) = load_ml1m_data()

        print(f"  Users: {self.num_users:,} | Movies: {self.num_movies:,}")

        self._models: dict[str, nn.Module] = {}
        self._load_all()

    # ----------------------------------------------------------
    def _load_checkpoint(self, model: nn.Module, name: str) -> nn.Module:
        ckpt_path = CKPT_DIR / f"{name}.pt"
        if not ckpt_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}")
        ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
        model.load_state_dict(ckpt["model_state_dict"])
        model = model.to(device)
        model.eval()
        print(f"  Loaded {name}.pt (best epoch {ckpt.get('epoch', '?')},"
              f" NDCG@10={ckpt.get('best_ndcg', 0):.4f})")
        return model

    # ----------------------------------------------------------
    def _load_all(self):
        EMB_DIM = 64

        print("Loading checkpoints...")

        # MF
        mf = MatrixFactorization(self.num_users, self.num_movies, EMB_DIM)
        self._models["mf"] = self._load_checkpoint(mf, "mf_model")

        # NGCF
        ngcf = NGCF(self.num_users, self.num_movies, EMB_DIM, n_layers=3)
        ngcf  = self._load_checkpoint(ngcf, "ngcf_model")
        ngcf.set_edge_index(self.edge_index)
        self._models["ngcf"] = ngcf

        # LightGCN
        lgcn = LightGCN(self.num_users, self.num_movies, EMB_DIM, n_layers=3)
        lgcn  = self._load_checkpoint(lgcn, "lightgcn_model")
        lgcn.set_edge_index(self.edge_index)
        self._models["lightgcn"] = lgcn

        print("All models ready.")

    # ----------------------------------------------------------
    def get(self, model_name: str) -> nn.Module:
        name = model_name.lower()
        if name not in self._models:
            raise ValueError(f"Unknown model '{model_name}'. Choose: mf | ngcf | lightgcn")
        return self._models[name]

    # ----------------------------------------------------------
    def available_models(self) -> list[str]:
        return list(self._models.keys())


# ============================================================
# GLOBAL SINGLETON  (imported by other modules)
# ============================================================
registry: ModelRegistry | None = None


def get_registry() -> ModelRegistry:
    """Return the global ModelRegistry, initializing it on first call."""
    global registry
    if registry is None:
        registry = ModelRegistry()
    return registry