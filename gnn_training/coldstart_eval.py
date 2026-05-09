import os
import sys

# Allow running from either project root or gnn_training/ directory
_SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
os.chdir(_PROJECT_ROOT)
sys.path.insert(0, _SCRIPT_DIR)

import json
import random
import numpy as np
import pandas as pd
import torch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from collections import Counter

from train import (
    download_dataset, load_dataset, preprocess,
    build_edge_index,
    LightGCN,
    precision_at_k, recall_at_k, ndcg_at_k,
    EMB_DIM, CKPT_DIR, RESULT_DIR, device,
)

RANDOM_SEED  = 42
N_SIMULATE   = 500   # number of cold-start users to simulate
MIN_TRAIN    = 15    # minimum training interactions to be eligible
N_SEED_ITEMS = 5     # items revealed for rating-pattern surrogate
K            = 10    # recommendation list length


# ─── LightGCN loader ────────────────────────────────────────────
def load_lightgcn(num_users, num_movies, edge_index):
    model = LightGCN(num_users, num_movies, EMB_DIM, n_layers=3)
    ckpt  = torch.load(f'{CKPT_DIR}/lightgcn_model.pt',
                       map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    model = model.to(device)
    model.set_edge_index(edge_index)
    model.eval()
    return model


# ─── Genre utilities ────────────────────────────────────────────
def build_genre_lookup(movies, movie2idx):
    lookup = {}
    for _, row in movies.iterrows():
        if row['movie_id'] in movie2idx:
            idx = movie2idx[row['movie_id']]
            lookup[idx] = [g.strip() for g in str(row['genres']).split('|') if g.strip()]
    return lookup


def genre_vector_sparse(item_set, genre_lookup, genre2idx):
    vec = np.zeros(len(genre2idx), dtype=float)
    for m in item_set:
        for g in genre_lookup.get(m, []):
            if g in genre2idx:
                vec[genre2idx[g]] += 1
    norm = vec.sum()
    return vec / norm if norm > 0 else vec


def cosine_sim(a, b):
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# ─── LightGCN recommendation for an existing user ───────────────
def lgcn_recs_for(model, user_idx, num_movies, train_user_items, k=K):
    model.eval()
    with torch.no_grad():
        u = torch.tensor([user_idx], dtype=torch.long).to(device)
        scores = model.get_scores(u, num_movies)[0].cpu().numpy()
    seen = train_user_items.get(user_idx, set())
    for m in seen:
        if m < num_movies:
            scores[m] = -np.inf
    return np.argsort(scores)[::-1][:k].tolist()


# ─── Popularity list (precomputed) ──────────────────────────────
def build_popularity_list(train_df):
    counts = train_df.groupby('movie_idx').size()
    return counts.sort_values(ascending=False).index.tolist()


# ─── Build surrogate index ──────────────────────────────────────
def build_surrogate_index(train_user_items, genre_lookup, genre2idx,
                          exclude_users=None):
    """Precompute genre vector and item sets for all candidate users."""
    exclude = exclude_users or set()
    index = {}
    for uid, items in train_user_items.items():
        if uid in exclude:
            continue
        if len(items) < MIN_TRAIN:
            continue
        gvec = genre_vector_sparse(items, genre_lookup, genre2idx)
        index[uid] = {'genre_vec': gvec, 'items': items}
    return index


# ─── Metrics helper ─────────────────────────────────────────────
def hit_rate_at_k(recommended, relevant, k):
    return 1.0 if len(set(recommended[:k]) & relevant) > 0 else 0.0


def evaluate_recs_list(rec_lists, test_user_items, k=K):
    """rec_lists: {user_idx: [movie_idx, ...]}"""
    prec, rec, ndcg, hr = [], [], [], []
    for uid, recs in rec_lists.items():
        relevant = test_user_items.get(uid, set())
        if not relevant:
            continue
        prec.append(precision_at_k(recs, relevant, k))
        rec.append(recall_at_k(recs, relevant, k))
        ndcg.append(ndcg_at_k(recs, relevant, k))
        hr.append(hit_rate_at_k(recs, relevant, k))
    return {
        'Precision@10': float(np.mean(prec)),
        'Recall@10':    float(np.mean(rec)),
        'NDCG@10':      float(np.mean(ndcg)),
        'HitRate@10':   float(np.mean(hr)),
    }


# ─── Simulation ─────────────────────────────────────────────────
def run_simulation(sim_users, train_user_items, test_user_items,
                   surrogate_index, model, num_movies,
                   popularity_list, genre2idx, genre_lookup, rng):

    random_recs    = {}
    popularity_recs = {}
    genre_recs     = {}
    rating_recs    = {}

    all_movies = list(range(num_movies))

    for user_idx in sim_users:
        hidden_train = train_user_items[user_idx]   # pretend new user

        # 1. Random
        candidates = [m for m in all_movies if m not in hidden_train]
        random_recs[user_idx] = rng.sample(candidates, min(K, len(candidates)))

        # 2. Popularity (global top-K, excluding nothing since new user has no history)
        popularity_recs[user_idx] = popularity_list[:K]

        # 3. Genre surrogate
        hidden_gvec = genre_vector_sparse(hidden_train, genre_lookup, genre2idx)
        best_uid, best_sim = None, -1.0
        for cand_uid, info in surrogate_index.items():
            if cand_uid == user_idx:
                continue
            s = cosine_sim(hidden_gvec, info['genre_vec'])
            if s > best_sim:
                best_sim, best_uid = s, cand_uid
        if best_uid is not None:
            genre_recs[user_idx] = lgcn_recs_for(
                model, best_uid, num_movies, train_user_items, k=K)
        else:
            genre_recs[user_idx] = popularity_list[:K]

        # 4. Rating surrogate — reveal first N_SEED_ITEMS interactions
        seed_items = set(list(hidden_train)[:N_SEED_ITEMS])
        best_uid2, best_jacc = None, -1.0
        for cand_uid, info in surrogate_index.items():
            if cand_uid == user_idx:
                continue
            union = len(seed_items | info['items'])
            inter = len(seed_items & info['items'])
            jacc  = inter / union if union > 0 else 0.0
            if jacc > best_jacc:
                best_jacc, best_uid2 = jacc, cand_uid
        if best_uid2 is not None:
            rating_recs[user_idx] = lgcn_recs_for(
                model, best_uid2, num_movies, train_user_items, k=K)
        else:
            rating_recs[user_idx] = popularity_list[:K]

    return random_recs, popularity_recs, genre_recs, rating_recs


# ─── Chart ──────────────────────────────────────────────────────
def plot_coldstart(all_results):
    strategies = ['Random', 'Popularity', 'Genre Surrogate', 'Rating Surrogate']
    metrics    = ['Precision@10', 'Recall@10', 'NDCG@10', 'HitRate@10']
    colors     = ['#94a3b8', '#64748b', '#5b8db8', '#27ae60']

    fig, axes = plt.subplots(1, 4, figsize=(18, 6))

    for ax, metric in zip(axes, metrics):
        vals = [all_results[s][metric] for s in strategies]
        bars = ax.bar(
            range(len(strategies)), vals,
            color=colors, edgecolor='white', linewidth=0.5,
        )
        for bar, val in zip(bars, vals):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.001,
                f'{val:.4f}',
                ha='center', va='bottom', fontsize=8.5, fontweight='bold',
            )
        # Highlight best
        best_idx = int(np.argmax(vals))
        bars[best_idx].set_edgecolor('#f59e0b')
        bars[best_idx].set_linewidth(2.5)

        # Improvement of best surrogate over Popularity
        pop_val  = all_results['Popularity'][metric]
        best_val = max(all_results['Genre Surrogate'][metric],
                       all_results['Rating Surrogate'][metric])
        if pop_val > 0:
            gain = (best_val - pop_val) / pop_val * 100
            sign = '+' if gain >= 0 else ''
            best_s_idx = (3 if all_results['Rating Surrogate'][metric] >=
                          all_results['Genre Surrogate'][metric] else 2)
            ax.annotate(
                f'{sign}{gain:.1f}% vs Pop',
                xy=(best_s_idx, best_val),
                xytext=(best_s_idx - 0.5, best_val + 0.015),
                fontsize=7.5, color='#27ae60', fontweight='bold',
                arrowprops=dict(arrowstyle='->', color='#27ae60', lw=1),
            )

        ax.set_xticks(range(len(strategies)))
        ax.set_xticklabels(['Random', 'Popularity', 'Genre\nSurrogate',
                            'Rating\nSurrogate'], fontsize=9)
        ax.set_ylabel(metric, fontsize=10)
        ax.set_title(metric, fontsize=11, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='y')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)

    plt.suptitle(
        f'Cold-Start Evaluation — {N_SIMULATE} Simulated New Users  '
        f'(seed={N_SEED_ITEMS} items for Rating Surrogate)\n'
        'Surrogate strategies: find most similar existing user '
        '→ serve their LightGCN recommendations',
        fontsize=11, fontweight='bold',
    )
    plt.tight_layout()
    out = f'{RESULT_DIR}/coldstart_eval.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'Chart saved: {out}')


# ─── Console summary ────────────────────────────────────────────
def print_table(all_results):
    strategies = ['Random', 'Popularity', 'Genre Surrogate', 'Rating Surrogate']
    metrics    = ['Precision@10', 'Recall@10', 'NDCG@10', 'HitRate@10']
    print('\n' + '=' * 70)
    header = f'  {"Strategy":<20}'
    for m in metrics:
        header += f'{m:>12}'
    print(header)
    print('=' * 70)
    for s in strategies:
        row = f'  {s:<20}'
        for m in metrics:
            row += f'{all_results[s][m]:>12.4f}'
        print(row)
    print('=' * 70)


# ─── Main ───────────────────────────────────────────────────────
def main():
    rng = random.Random(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    download_dataset()
    ratings, movies, users = load_dataset()
    train_df, val_df, test_df, num_users, num_movies, idx2movie = preprocess(ratings)

    edge_index       = build_edge_index(train_df, num_users).to(device)
    train_user_items = train_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()
    test_user_items  = test_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()

    # Genre index
    unique_movies = sorted(ratings['movie_id'].unique())
    movie2idx     = {m: i for i, m in enumerate(unique_movies)}
    genre_lookup  = build_genre_lookup(movies, movie2idx)
    all_genres    = sorted({g for gl in genre_lookup.values() for g in gl})
    genre2idx     = {g: i for i, g in enumerate(all_genres)}

    # Popularity list
    pop_list = build_popularity_list(train_df)

    # Cold-start candidates: must have >= MIN_TRAIN interactions AND test items
    eligible = [
        u for u in test_user_items
        if u in train_user_items and len(train_user_items[u]) >= MIN_TRAIN
    ]
    sim_users = rng.sample(eligible, min(N_SIMULATE, len(eligible)))
    print(f'\nCold-start simulation: {len(sim_users)} users '
          f'(min_train={MIN_TRAIN}, seed_items={N_SEED_ITEMS})')

    # Surrogate index uses ALL other users (they are the "existing user base")
    print('Building surrogate index ...')
    surrogate_index = build_surrogate_index(
        train_user_items, genre_lookup, genre2idx,
        exclude_users=set(sim_users),
    )
    print(f'  Surrogate pool size: {len(surrogate_index):,} users')

    # Load LightGCN
    print('Loading LightGCN checkpoint ...')
    model = load_lightgcn(num_users, num_movies, edge_index)

    # Run simulation
    print('Running simulation ...')
    random_recs, pop_recs, genre_recs, rating_recs = run_simulation(
        sim_users, train_user_items, test_user_items,
        surrogate_index, model, num_movies,
        pop_list, genre2idx, genre_lookup, rng,
    )

    # Evaluate
    all_results = {
        'Random':           evaluate_recs_list(random_recs,  test_user_items),
        'Popularity':       evaluate_recs_list(pop_recs,     test_user_items),
        'Genre Surrogate':  evaluate_recs_list(genre_recs,   test_user_items),
        'Rating Surrogate': evaluate_recs_list(rating_recs,  test_user_items),
    }

    print_table(all_results)

    json_path = f'{RESULT_DIR}/coldstart_results.json'
    with open(json_path, 'w') as f:
        json.dump(all_results, f, indent=2)
    print(f'\nJSON saved: {json_path}')

    plot_coldstart(all_results)


if __name__ == '__main__':
    main()