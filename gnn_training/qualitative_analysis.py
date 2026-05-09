import os
import sys

# Allow running from either project root or gnn_training/ directory
_SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
os.chdir(_PROJECT_ROOT)
sys.path.insert(0, _SCRIPT_DIR)

import numpy as np
import pandas as pd
import torch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from collections import Counter

from train import (
    download_dataset, load_dataset, preprocess,
    build_edge_index,
    MatrixFactorization, NGCF, LightGCN,
    EMB_DIM, CKPT_DIR, RESULT_DIR, device,
)


# ─── Load checkpoints ───────────────────────────────────────────
def load_models(num_users, num_movies, edge_index):
    def _load(model, name):
        path = f'{CKPT_DIR}/{name}.pt'
        ckpt = torch.load(path, map_location=device, weights_only=False)
        model.load_state_dict(ckpt['model_state_dict'])
        model = model.to(device)
        if hasattr(model, 'set_edge_index'):
            model.set_edge_index(edge_index)
        model.eval()
        return model

    return {
        'MF':       _load(MatrixFactorization(num_users, num_movies, EMB_DIM), 'mf_model'),
        'NGCF':     _load(NGCF(num_users, num_movies, EMB_DIM, n_layers=3),   'ngcf_model'),
        'LightGCN': _load(LightGCN(num_users, num_movies, EMB_DIM, n_layers=3), 'lightgcn_model'),
    }


# ─── Genre utilities ────────────────────────────────────────────
def build_genre_lookup(movies, movie2idx):
    """Returns dict: movie_idx -> list[str] of genres."""
    lookup = {}
    for _, row in movies.iterrows():
        if row['movie_id'] in movie2idx:
            idx = movie2idx[row['movie_id']]
            lookup[idx] = [g.strip() for g in str(row['genres']).split('|') if g.strip()]
    return lookup


def genre_vector(item_set, genre_lookup, genre_list):
    """Normalised frequency vector over genre_list for a set of movie indices."""
    counts = Counter()
    for m in item_set:
        for g in genre_lookup.get(m, []):
            counts[g] += 1
    vec = np.array([counts.get(g, 0) for g in genre_list], dtype=float)
    total = vec.sum()
    return vec / total if total > 0 else vec


def genre_entropy(vec):
    p = vec[vec > 0]
    return float(-np.sum(p * np.log2(p)))


def top_genre_ratio(vec):
    return float(vec.max()) if vec.sum() > 0 else 0.0


# ─── User selection ─────────────────────────────────────────────
def select_users(train_user_items, test_user_items, genre_lookup, genre_list):
    # Candidate pool: users that have both train AND test items
    candidates = [u for u in test_user_items if u in train_user_items
                  and len(train_user_items[u]) >= 5]

    train_sizes = {u: len(train_user_items[u]) for u in candidates}
    entropies   = {}
    top_ratios  = {}
    for u in candidates:
        vec = genre_vector(train_user_items[u], genre_lookup, genre_list)
        entropies[u]  = genre_entropy(vec)
        top_ratios[u] = top_genre_ratio(vec)

    # Heavy: most training items
    heavy = max(candidates, key=lambda u: train_sizes[u])

    # Light: fewest training items (at least 5)
    light = min(candidates, key=lambda u: train_sizes[u])

    # Genre-focused: lowest entropy (most concentrated genre taste)
    genre_focus = min(candidates, key=lambda u: entropies[u])

    # Mixed: highest entropy (most diverse genre taste)
    mixed = max(candidates, key=lambda u: entropies[u])

    # Ensure 4 distinct users
    chosen = {}
    for label, uid in [('Heavy User', heavy), ('Light User', light),
                       ('Genre-Focused', genre_focus), ('Mixed Taste', mixed)]:
        if uid not in chosen.values():
            chosen[label] = uid
        else:
            # Fallback: pick next best not already selected
            pool = sorted(candidates, key=lambda u: train_sizes[u], reverse=True)
            for alt in pool:
                if alt not in chosen.values():
                    chosen[label] = alt
                    break

    return chosen


# ─── Recommendation generation ──────────────────────────────────
def get_top_k(model, user_idx, num_movies, train_user_items, k=10):
    model.eval()
    with torch.no_grad():
        u = torch.tensor([user_idx], dtype=torch.long).to(device)
        scores = model.get_scores(u, num_movies)[0].cpu().numpy()
    seen = train_user_items.get(user_idx, set())
    for m in seen:
        if m < num_movies:
            scores[m] = -np.inf
    return np.argsort(scores)[::-1][:k].tolist()


# ─── Chart ──────────────────────────────────────────────────────
TOP_GENRES = [
    'Drama', 'Comedy', 'Action', 'Thriller', 'Romance',
    'Adventure', 'Sci-Fi', 'Horror', 'Crime', 'Animation',
]

GENRE_COLORS = {
    'Drama':     '#5b8db8',
    'Comedy':    '#f59e0b',
    'Action':    '#ef4444',
    'Thriller':  '#8b5cf6',
    'Romance':   '#ec4899',
    'Adventure': '#14b8a6',
    'Sci-Fi':    '#6366f1',
    'Horror':    '#64748b',
    'Crime':     '#d97706',
    'Animation': '#22c55e',
    'Other':     '#cbd5e1',
}


def genre_dist_for_display(item_set, genre_lookup):
    """Genre % dict bucketing rare genres into 'Other'."""
    counts = Counter()
    for m in item_set:
        for g in genre_lookup.get(m, []):
            counts[g] += 1
    total = sum(counts.values())
    if total == 0:
        return {}
    dist = {}
    other = 0
    for g, c in counts.items():
        if g in TOP_GENRES:
            dist[g] = c / total
        else:
            other += c / total
    if other > 0:
        dist['Other'] = other
    return dict(sorted(dist.items(), key=lambda x: -x[1]))


def draw_genre_bar(ax, dist, label, bar_height=0.6, y=0):
    x = 0
    for genre, frac in dist.items():
        color = GENRE_COLORS.get(genre, '#cbd5e1')
        ax.barh(y, frac, left=x, height=bar_height,
                color=color, edgecolor='white', linewidth=0.4)
        if frac > 0.06:
            ax.text(x + frac / 2, y, f'{frac:.0%}',
                    ha='center', va='center', fontsize=7, color='white',
                    fontweight='bold')
        x += frac
    ax.text(-0.01, y, label, ha='right', va='center', fontsize=9)


def plot_qualitative(user_cases, models, train_user_items, num_movies,
                     genre_lookup, idx2title):
    n_users  = len(user_cases)
    row_labels = list(user_cases.keys())
    model_names = list(models.keys())

    fig, axes = plt.subplots(n_users, 1, figsize=(16, n_users * 3.2))
    if n_users == 1:
        axes = [axes]

    fig.suptitle(
        'Qualitative Analysis: Genre Profile vs Recommendation Genre Composition\n'
        '(Each bar = genre distribution; longer = more of that genre)',
        fontsize=13, fontweight='bold', y=0.98,
    )

    all_genres_shown = set()

    for ax, (user_label, user_idx) in zip(axes, user_cases.items()):
        train_items = train_user_items.get(user_idx, set())
        n_train     = len(train_items)

        rows   = ['User Profile'] + [f'{m} Recs' for m in model_names]
        y_vals = [3, 2, 1, 0]

        # User's own genre distribution
        user_dist = genre_dist_for_display(train_items, genre_lookup)
        draw_genre_bar(ax, user_dist, 'User Profile', y=3)
        all_genres_shown.update(user_dist.keys())

        # Each model's recommendations
        for i, (mname, model) in enumerate(models.items()):
            recs = get_top_k(model, user_idx, num_movies, train_user_items, k=10)
            rec_dist = genre_dist_for_display(set(recs), genre_lookup)
            draw_genre_bar(ax, rec_dist, f'{mname} Recs', y=2 - i)
            all_genres_shown.update(rec_dist.keys())

        # Overlap annotations: Jaccard between user's top-20 train and model recs
        train_top20 = set(list(train_items)[:20])
        for i, (mname, model) in enumerate(models.items()):
            recs_set = set(get_top_k(model, user_idx, num_movies, train_user_items, k=10))
            overlap = len(recs_set & train_items)
            ax.text(1.01, 2 - i, f'Hit={overlap}/10',
                    transform=ax.get_yaxis_transform(),
                    va='center', fontsize=8, color='#475569')

        n_test = len([])  # placeholder — label only shows train count
        ax.set_title(
            f'{user_label}  (user_idx={user_idx}, '
            f'train={n_train} interactions)',
            fontsize=10, fontweight='bold', loc='left', pad=4,
        )
        ax.set_xlim(0, 1)
        ax.set_yticks([])
        ax.set_xlabel('Genre proportion', fontsize=8)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_visible(False)
        ax.axvline(0, color='#e2e8f0', linewidth=0.5)

    # Legend
    patches = [
        mpatches.Patch(color=GENRE_COLORS.get(g, '#cbd5e1'), label=g)
        for g in sorted(all_genres_shown)
    ]
    fig.legend(handles=patches, loc='lower center', ncol=6,
               fontsize=8, title='Genre', title_fontsize=9,
               bbox_to_anchor=(0.5, -0.02), frameon=False)

    plt.tight_layout(rect=[0, 0.04, 1, 0.96])
    out = f'{RESULT_DIR}/qualitative_cases.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'Chart saved: {out}')


# ─── Console output: movie titles ───────────────────────────────
def print_cases(user_cases, models, train_user_items, num_movies,
                genre_lookup, idx2title):
    for user_label, user_idx in user_cases.items():
        train_items = train_user_items.get(user_idx, set())
        print(f'\n{"=" * 60}')
        print(f'  {user_label}  (user_idx={user_idx}, '
              f'train={len(train_items)} interactions)')
        print(f'{"=" * 60}')

        # User's top genres from training
        dist = genre_dist_for_display(train_items, genre_lookup)
        top5 = list(dist.items())[:5]
        print(f'  Top genres: ' +
              ', '.join(f'{g} {p:.0%}' for g, p in top5))

        for mname, model in models.items():
            recs = get_top_k(model, user_idx, num_movies, train_user_items, k=10)
            print(f'\n  [{mname}]')
            for rank, midx in enumerate(recs, 1):
                title  = idx2title.get(midx, f'movie_{midx}')
                genres = ', '.join(genre_lookup.get(midx, []))
                print(f'    {rank:2d}. {title[:45]:<45}  [{genres}]')


# ─── Main ───────────────────────────────────────────────────────
def main():
    download_dataset()
    ratings, movies, users = load_dataset()
    train_df, val_df, test_df, num_users, num_movies, idx2movie = preprocess(ratings)

    edge_index       = build_edge_index(train_df, num_users).to(device)
    train_user_items = train_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()
    test_user_items  = test_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()

    # Build lookups
    unique_users  = sorted(ratings['user_id'].unique())
    unique_movies = sorted(ratings['movie_id'].unique())
    movie2idx = {m: i for i, m in enumerate(unique_movies)}

    genre_lookup = build_genre_lookup(movies, movie2idx)
    genre_list   = sorted({g for genres in genre_lookup.values() for g in genres})

    # movie_idx -> title string
    idx2title = {}
    for _, row in movies.iterrows():
        if row['movie_id'] in movie2idx:
            idx2title[movie2idx[row['movie_id']]] = row['title']

    print('\nSelecting representative users ...')
    user_cases = select_users(train_user_items, test_user_items,
                              genre_lookup, genre_list)
    for label, uid in user_cases.items():
        n = len(train_user_items.get(uid, set()))
        vec = genre_vector(train_user_items[uid], genre_lookup, genre_list)
        print(f'  {label:<16} user_idx={uid:4d}  '
              f'train={n:4d}  entropy={genre_entropy(vec):.2f}  '
              f'top_genre={top_genre_ratio(vec):.0%}')

    print('\nLoading GNN checkpoints ...')
    models = load_models(num_users, num_movies, edge_index)

    print_cases(user_cases, models, train_user_items, num_movies,
                genre_lookup, idx2title)

    print('\nGenerating chart ...')
    plot_qualitative(user_cases, models, train_user_items, num_movies,
                     genre_lookup, idx2title)


if __name__ == '__main__':
    main()