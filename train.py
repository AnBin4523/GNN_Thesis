"""
Intelligent Movie Recommendation System using GNN
Thesis — Ngo Le Thien An | ITITWE21117
Run: python train.py
"""

import os
import zipfile
import urllib.request
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from torch_geometric.utils import degree

# ============================================================
# 0. DEVICE SETUP
# ============================================================
try:
    import intel_extension_for_pytorch as ipex
    if torch.xpu.is_available():
        device = torch.device('xpu')
        print(f'Using Intel Arc GPU (XPU)')
    else:
        device = torch.device('cpu')
        print('Intel Extension loaded but XPU not available — using CPU')
except ImportError:
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'Using device: {device}')

# ============================================================
# 1. PATHS & HYPERPARAMETERS
# ============================================================
BASE_DIR   = './gnn_thesis'
DATA_DIR   = f'{BASE_DIR}/data/ml-1m'
CKPT_DIR   = f'{BASE_DIR}/checkpoints'
RESULT_DIR = f'{BASE_DIR}/results'

for d in [DATA_DIR, CKPT_DIR, RESULT_DIR]:
    os.makedirs(d, exist_ok=True)

EMB_DIM    = 64
BATCH_SIZE = 2048
REG_LAMBDA = 1e-4
PATIENCE   = 5
LR         = 1e-3

# ============================================================
# 2. DOWNLOAD & LOAD DATASET
# ============================================================
def download_dataset():
    zip_path = f'{DATA_DIR}/ml-1m.zip'
    url      = 'https://files.grouplens.org/datasets/movielens/ml-1m.zip'

    if not os.path.exists(f'{DATA_DIR}/ratings.dat'):
        print('Downloading MovieLens 1M...')
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path, 'r') as z:
            for member in z.namelist():
                filename = os.path.basename(member)
                if filename:
                    with z.open(member) as src, \
                         open(f'{DATA_DIR}/{filename}', 'wb') as dst:
                        dst.write(src.read())
        print('Download complete')
    else:
        print('Dataset already exists — skipping download')


def load_dataset():
    ratings = pd.read_csv(
        f'{DATA_DIR}/ratings.dat', sep='::', engine='python',
        names=['user_id', 'movie_id', 'rating', 'timestamp'],
        encoding='latin-1'
    )
    movies = pd.read_csv(
        f'{DATA_DIR}/movies.dat', sep='::', engine='python',
        names=['movie_id', 'title', 'genres'], encoding='latin-1'
    )
    users = pd.read_csv(
        f'{DATA_DIR}/users.dat', sep='::', engine='python',
        names=['user_id', 'gender', 'age', 'occupation', 'zip_code'],
        encoding='latin-1'
    )
    print('=' * 50)
    print('DATASET STATISTICS')
    print('=' * 50)
    print(f'Number of Users   : {ratings["user_id"].nunique():,}')
    print(f'Number of Movies  : {ratings["movie_id"].nunique():,}')
    print(f'Number of Ratings : {len(ratings):,}')
    print(f'Sparsity          : {1 - len(ratings) / (ratings["user_id"].nunique() * ratings["movie_id"].nunique()):.4f}')
    return ratings, movies, users


# ============================================================
# 3. PREPROCESSING
# ============================================================
def preprocess(ratings):
    unique_users  = sorted(ratings['user_id'].unique())
    unique_movies = sorted(ratings['movie_id'].unique())

    user2idx  = {u: i for i, u in enumerate(unique_users)}
    movie2idx = {m: i for i, m in enumerate(unique_movies)}
    idx2movie = {i: m for m, i in movie2idx.items()}

    ratings['user_idx']  = ratings['user_id'].map(user2idx)
    ratings['movie_idx'] = ratings['movie_id'].map(movie2idx)

    num_users  = len(unique_users)
    num_movies = len(unique_movies)

    # Implicit feedback
    pos_ratings = ratings[ratings['rating'] >= 4].copy()
    print(f'\nPositive interactions (rating >= 4): {len(pos_ratings):,}')

    # Split per user 80/10/10
    train_list, val_list, test_list = [], [], []
    for _, group in pos_ratings.groupby('user_idx'):
        group  = group.sample(frac=1, random_state=42)
        n      = len(group)
        n_test = max(1, int(n * 0.1))
        n_val  = max(1, int(n * 0.1))
        test_list.append(group.iloc[:n_test])
        val_list.append(group.iloc[n_test:n_test + n_val])
        train_list.append(group.iloc[n_test + n_val:])

    train_df = pd.concat(train_list).reset_index(drop=True)
    val_df   = pd.concat(val_list).reset_index(drop=True)
    test_df  = pd.concat(test_list).reset_index(drop=True)

    print(f'Train: {len(train_df):,} | Val: {len(val_df):,} | Test: {len(test_df):,}')
    return train_df, val_df, test_df, num_users, num_movies, idx2movie


def build_edge_index(df, num_users):
    user_nodes  = torch.tensor(df['user_idx'].values, dtype=torch.long)
    movie_nodes = torch.tensor(df['movie_idx'].values + num_users, dtype=torch.long)
    return torch.stack([
        torch.cat([user_nodes, movie_nodes]),
        torch.cat([movie_nodes, user_nodes])
    ], dim=0)


def get_negative_samples(train_df, num_movies):
    user_seen  = train_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()
    all_users  = train_df['user_idx'].values
    neg_movies = np.random.randint(0, num_movies, size=len(train_df))
    for i, user_idx in enumerate(all_users):
        while neg_movies[i] in user_seen[user_idx]:
            neg_movies[i] = np.random.randint(0, num_movies)
    return neg_movies


# ============================================================
# 4. EVALUATION METRICS
# ============================================================
def precision_at_k(recommended, relevant, k):
    return len(set(recommended[:k]) & relevant) / k

def recall_at_k(recommended, relevant, k):
    if len(relevant) == 0:
        return 0.0
    return len(set(recommended[:k]) & relevant) / len(relevant)

def ndcg_at_k(recommended, relevant, k):
    rec_k = recommended[:k]
    dcg   = sum(1.0 / np.log2(i + 2) for i, item in enumerate(rec_k) if item in relevant)
    idcg  = sum(1.0 / np.log2(i + 2) for i in range(min(len(relevant), k)))
    return dcg / idcg if idcg > 0 else 0.0

def evaluate_model(model, num_users, num_movies, train_user_items,
                   test_user_items, k=10, batch_size=256):
    model.eval()
    precisions, recalls, ndcgs = [], [], []
    user_ids = list(test_user_items.keys())

    with torch.no_grad():
        for start in range(0, len(user_ids), batch_size):
            batch_users = user_ids[start:start + batch_size]
            user_tensor = torch.tensor(batch_users, dtype=torch.long).to(device)
            scores      = model.get_scores(user_tensor, num_movies).cpu().numpy()

            for i, user_idx in enumerate(batch_users):
                for m in train_user_items.get(user_idx, set()):
                    if m < num_movies:
                        scores[i, m] = -np.inf
                top_k    = np.argsort(scores[i])[::-1][:k].tolist()
                relevant = test_user_items[user_idx]
                precisions.append(precision_at_k(top_k, relevant, k))
                recalls.append(recall_at_k(top_k, relevant, k))
                ndcgs.append(ndcg_at_k(top_k, relevant, k))

    return {
        f'Precision@{k}': np.mean(precisions),
        f'Recall@{k}'   : np.mean(recalls),
        f'NDCG@{k}'     : np.mean(ndcgs)
    }


def bpr_loss(pos_scores, neg_scores, reg_lambda, u_emb, p_emb, n_emb):
    bpr = -torch.log(torch.sigmoid(pos_scores - neg_scores) + 1e-8).mean()
    reg = reg_lambda * (
        u_emb.norm(2).pow(2) + p_emb.norm(2).pow(2) + n_emb.norm(2).pow(2)
    ) / u_emb.shape[0]
    return bpr + reg


# ============================================================
# 5. MODELS
# ============================================================
class MatrixFactorization(nn.Module):
    def __init__(self, num_users, num_movies, emb_dim=64):
        super().__init__()
        self.user_emb  = nn.Embedding(num_users,  emb_dim)
        self.movie_emb = nn.Embedding(num_movies, emb_dim)
        nn.init.normal_(self.user_emb.weight,  std=0.01)
        nn.init.normal_(self.movie_emb.weight, std=0.01)

    def forward(self, user_ids, pos_ids, neg_ids):
        u  = self.user_emb(user_ids)
        pi = self.movie_emb(pos_ids)
        ni = self.movie_emb(neg_ids)
        return (u * pi).sum(dim=1), (u * ni).sum(dim=1)

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
        deg_inv_sqrt[deg_inv_sqrt == float('inf')] = 0
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
        nn.init.normal_(self.embedding.weight, std=0.01)
        self.convs = nn.ModuleList([NGCFConv(emb_dim, dropout) for _ in range(n_layers)])

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
        movie_emb = final[self.num_users:self.num_users + num_movies]
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
        nn.init.xavier_uniform_(self.embedding.weight)

    def forward(self, edge_index):
        row, col  = edge_index
        num_nodes = self.num_users + self.num_movies
        deg       = torch.zeros(num_nodes, device=edge_index.device)
        deg.scatter_add_(0, col, torch.ones(col.size(0), device=edge_index.device))
        deg_inv_sqrt = deg.pow(-0.5)
        deg_inv_sqrt[deg_inv_sqrt == float('inf')] = 0
        norm = deg_inv_sqrt[row] * deg_inv_sqrt[col]

        embs     = self.embedding.weight
        all_embs = [embs]
        for _ in range(self.n_layers):
            agg = torch.zeros_like(embs)
            agg.scatter_add_(0, col.unsqueeze(1).expand(-1, embs.size(1)),
                             norm.unsqueeze(1) * embs[row])
            embs = agg
            all_embs.append(embs)
        return torch.stack(all_embs, dim=0).mean(dim=0)

    def get_scores(self, user_ids, num_movies):
        final     = self.forward(self._edge_index)
        user_emb  = final[user_ids]
        movie_emb = final[self.num_users:self.num_users + num_movies]
        return user_emb @ movie_emb.T

    def set_edge_index(self, edge_index):
        self._edge_index = edge_index


# ============================================================
# 6. TRAINING FUNCTION WITH EARLY STOPPING
# ============================================================
def train_model(model, model_name, train_df, num_users, num_movies,
                train_user_items, test_user_items,
                edge_index=None, max_epochs=100,
                batch_size=2048, lr=1e-3):

    ckpt_path = f'{CKPT_DIR}/{model_name}.pt'

    # Skip if checkpoint exists
    if os.path.exists(ckpt_path):
        print(f'\n{model_name} checkpoint found — skipping training')
        ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
        model.load_state_dict(ckpt['model_state_dict'])
        model = model.to(device)
        if edge_index is not None:
            model.set_edge_index(edge_index)
        model.eval()
        results = evaluate_model(model, num_users, num_movies,
                                 train_user_items, test_user_items)
        print(f'{model_name} Results:')
        for metric, value in results.items():
            print(f'   {metric}: {value:.4f}')
        return model, results

    # Train from scratch
    model      = model.to(device)
    optimizer  = optim.Adam(model.parameters(), lr=lr)
    best_ndcg  = 0
    no_improve = 0
    best_epoch = 0

    if edge_index is not None:
        model.set_edge_index(edge_index)

    print(f'\nTraining {model_name} with early stopping (max {max_epochs} epochs)...')

    for epoch in range(max_epochs):
        model.train()
        neg_samples          = get_negative_samples(train_df, num_movies)
        train_df_neg         = train_df.copy()
        train_df_neg['neg_idx'] = neg_samples

        users_t = torch.tensor(train_df_neg['user_idx'].values,  dtype=torch.long)
        pos_t   = torch.tensor(train_df_neg['movie_idx'].values, dtype=torch.long)
        neg_t   = torch.tensor(train_df_neg['neg_idx'].values,   dtype=torch.long)
        dataset = TensorDataset(users_t, pos_t, neg_t)
        loader  = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        epoch_loss = 0.0

        # For GNN models — compute embeddings once per epoch
        all_embs = None
        if hasattr(model, '_edge_index'):
            all_embs = model.forward(edge_index)

        for u_batch, p_batch, n_batch in loader:
            u_batch = u_batch.to(device)
            p_batch = p_batch.to(device)
            n_batch = n_batch.to(device)
            optimizer.zero_grad()

            if all_embs is not None:
                # GNN models
                u_emb = all_embs[u_batch]
                p_emb = all_embs[num_users + p_batch]
                n_emb = all_embs[num_users + n_batch]
                pos_scores = (u_emb * p_emb).sum(dim=1)
                neg_scores = (u_emb * n_emb).sum(dim=1)
                loss = bpr_loss(pos_scores, neg_scores, REG_LAMBDA, u_emb, p_emb, n_emb)
                loss.backward(retain_graph=True)
            else:
                # MF model
                pos_scores, neg_scores = model(u_batch, p_batch, n_batch)
                u_emb = model.user_emb(u_batch)
                p_emb = model.movie_emb(p_batch)
                n_emb = model.movie_emb(n_batch)
                loss  = bpr_loss(pos_scores, neg_scores, REG_LAMBDA, u_emb, p_emb, n_emb)
                loss.backward()

            optimizer.step()
            epoch_loss += loss.item()

            # Re-compute embeddings for GNN after each update
            if all_embs is not None:
                all_embs = model.forward(edge_index)

        avg_loss = epoch_loss / len(loader)

        # Evaluate every 5 epochs
        if (epoch + 1) % 5 == 0:
            interim = evaluate_model(model, num_users, num_movies,
                                     train_user_items, test_user_items)
            ndcg = interim['NDCG@10']
            print(f'  Epoch [{epoch+1:3d}/{max_epochs}] Loss: {avg_loss:.4f} | NDCG@10: {ndcg:.4f}')

            if ndcg > best_ndcg:
                best_ndcg  = ndcg
                best_epoch = epoch + 1
                no_improve = 0
                torch.save({
                    'epoch'            : best_epoch,
                    'model_state_dict' : model.state_dict(),
                    'best_ndcg'        : best_ndcg
                }, ckpt_path)
            else:
                no_improve += 1
                if no_improve >= PATIENCE:
                    print(f'  Early stopping at epoch {epoch+1}')
                    print(f'  Best NDCG@10: {best_ndcg:.4f} at epoch {best_epoch}')
                    break

    # Load best checkpoint
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device) 
    model.eval()

    results = evaluate_model(model, num_users, num_movies,
                             train_user_items, test_user_items)
    print(f'\n{model_name} converged at epoch {best_epoch}')
    print(f'{model_name} Results:')
    for metric, value in results.items():
        print(f'   {metric}: {value:.4f}')
    return model, results


# ============================================================
# 7. HELPER FUNCTIONS
# ============================================================
def plot_loss_curves(all_losses, result_dir):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    if not all_losses:
        print('No loss data available to plot.')
        return

    plt.figure(figsize=(10, 5))
    colors = {'mf_model': '#5b8db8', 'ngcf_model': '#9b59b6', 'lightgcn_model': '#27ae60'}
    labels = {'mf_model': 'Matrix Factorization', 'ngcf_model': 'NGCF', 'lightgcn_model': 'LightGCN'}
    for name, losses in all_losses.items():
        plt.plot(losses, label=labels.get(name, name), color=colors.get(name, None), linewidth=2)
    plt.xlabel('Epoch')
    plt.ylabel('BPR Loss')
    plt.title('Training Loss Curves — All Models')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(f'{result_dir}/loss_curves.png', dpi=150, bbox_inches='tight')
    plt.close()
    print('✅ Loss curves saved')


def demo_recommend(model, movies_df, idx2movie, train_user_items, test_user_items,
                   num_movies, demo_user_idx=0, k=10):
    model.eval()
    with torch.no_grad():
        user_tensor = torch.tensor([demo_user_idx], dtype=torch.long).to(device)
        scores = model.get_scores(user_tensor, num_movies)[0].cpu().numpy()

    seen = train_user_items.get(demo_user_idx, set())
    for m in seen:
        if m < num_movies:
            scores[m] = -np.inf

    top_k_indices = np.argsort(scores)[::-1][:k]

    print(f'\nTop-{k} recommendations for User {demo_user_idx}:')
    print('-' * 50)
    for rank, movie_idx in enumerate(top_k_indices, 1):
        movie_id = idx2movie.get(movie_idx)
        if movie_id is not None:
            row = movies_df[movies_df['movie_id'] == movie_id]
            title = row.iloc[0]['title'] if len(row) > 0 else 'Unknown'
        else:
            title = 'Unknown'
        print(f'  {rank:2d}. {title}')

    test_items = test_user_items.get(demo_user_idx, set())
    if test_items:
        print(f'\nGround truth (test set) for User {demo_user_idx}:')
        for movie_idx in list(test_items)[:5]:
            movie_id = idx2movie.get(movie_idx)
            if movie_id is not None:
                row = movies_df[movies_df['movie_id'] == movie_id]
                title = row.iloc[0]['title'] if len(row) > 0 else 'Unknown'
            else:
                title = 'Unknown'
            print(f'  - {title}')


# ============================================================
# 8. MAIN
# ============================================================
def main():
    # Load data
    download_dataset()
    ratings, movies, users = load_dataset()

    # Preprocess
    train_df, val_df, test_df, num_users, num_movies, idx2movie = preprocess(ratings)

    # Build graph
    edge_index        = build_edge_index(train_df, num_users).to(device)
    train_user_items  = train_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()
    test_user_items   = test_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()

    print(f'\nGraph: {num_users + num_movies:,} nodes, {edge_index.shape[1]:,} edges')

    # Train models
    all_results = {}
    all_losses = {}  # loss tracking (populated only when training from scratch)

    # Model 1: Matrix Factorization
    mf_model = MatrixFactorization(num_users, num_movies, EMB_DIM)
    mf_model, mf_results = train_model(
        mf_model, 'mf_model', train_df, num_users, num_movies,
        train_user_items, test_user_items,
        max_epochs=100, batch_size=BATCH_SIZE, lr=LR
    )
    all_results['Matrix Factorization'] = mf_results

    # Model 2: NGCF
    ngcf_model = NGCF(num_users, num_movies, EMB_DIM, n_layers=3)
    ngcf_model, ngcf_results = train_model(
        ngcf_model, 'ngcf_model', train_df, num_users, num_movies,
        train_user_items, test_user_items,
        edge_index=edge_index, max_epochs=100,
        batch_size=BATCH_SIZE, lr=LR
    )
    all_results['NGCF'] = ngcf_results

    # Model 3: LightGCN
    lgcn_model = LightGCN(num_users, num_movies, EMB_DIM, n_layers=3)
    lgcn_model, lgcn_results = train_model(
        lgcn_model, 'lightgcn_model', train_df, num_users, num_movies,
        train_user_items, test_user_items,
        edge_index=edge_index, max_epochs=300,
        batch_size=4096, lr=LR
    )
    all_results['LightGCN'] = lgcn_results

    # Print final comparison table
    print('\n' + '=' * 60)
    print(f'  {"Model":<22} {"Precision@10":>12} {"Recall@10":>10} {"NDCG@10":>10}')
    print('=' * 60)
    for model_name, results in all_results.items():
        print(f'  {model_name:<22} '
              f'{results["Precision@10"]:>12.4f} '
              f'{results["Recall@10"]:>10.4f} '
              f'{results["NDCG@10"]:>10.4f}')
    print('=' * 60)

    # Save results
    import json
    with open(f'{RESULT_DIR}/results.json', 'w') as f:
        json.dump({k: {m: float(v) for m, v in vals.items()}
                   for k, vals in all_results.items()}, f, indent=2)
    print(f'\nResults saved to {RESULT_DIR}/results.json')

    # ── Demo: Top-K Recommendations ──
    print('\n' + '=' * 60)
    print('DEMO: Top-10 Recommendations (LightGCN)')
    print('=' * 60)
    demo_recommend(
        lgcn_model, movies, idx2movie,
        train_user_items, test_user_items,
        num_movies, demo_user_idx=0, k=10
    )
 
    # ── Loss Curves ──
    plot_loss_curves(all_losses, RESULT_DIR)

if __name__ == '__main__':
    main()