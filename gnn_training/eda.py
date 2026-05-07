import os
import numpy as np
import pandas as pd

BASE_DIR   = './gnn_training'
DATA_DIR   = f'{BASE_DIR}/data/ml-1m'
RESULT_DIR = f'{BASE_DIR}/results'
os.makedirs(RESULT_DIR, exist_ok=True)

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


# ─── Load raw data ────────────────────────────────────────────
def load_data():
    ratings = pd.read_csv(
        f'{DATA_DIR}/ratings.dat', sep='::', engine='python',
        names=['user_id', 'movie_id', 'rating', 'timestamp'],
        encoding='latin-1',
    )
    movies = pd.read_csv(
        f'{DATA_DIR}/movies.dat', sep='::', engine='python',
        names=['movie_id', 'title', 'genres'],
        encoding='latin-1',
    )
    users = pd.read_csv(
        f'{DATA_DIR}/users.dat', sep='::', engine='python',
        names=['user_id', 'gender', 'age', 'occupation', 'zip_code'],
        encoding='latin-1',
    )
    return ratings, movies, users


# ─── Reproduce the same split as train.py ─────────────────────
def reproduce_split(ratings):
    pos = ratings[ratings['rating'] >= 4].copy()

    unique_users  = sorted(ratings['user_id'].unique())
    unique_movies = sorted(ratings['movie_id'].unique())
    user2idx  = {u: i for i, u in enumerate(unique_users)}
    movie2idx = {m: i for i, m in enumerate(unique_movies)}

    pos['user_idx']  = pos['user_id'].map(user2idx)
    pos['movie_idx'] = pos['movie_id'].map(movie2idx)

    train_list, val_list, test_list = [], [], []
    for _, group in pos.groupby('user_idx'):
        group  = group.sample(frac=1, random_state=42)
        n      = len(group)
        n_test = max(1, int(n * 0.1))
        n_val  = max(1, int(n * 0.1))
        test_list.append(group.iloc[:n_test])
        val_list.append(group.iloc[n_test:n_test + n_val])
        train_list.append(group.iloc[n_test + n_val:])

    train_df = pd.concat(train_list)
    val_df   = pd.concat(val_list)
    test_df  = pd.concat(test_list)
    return train_df, val_df, test_df, pos


# ─── Chart ────────────────────────────────────────────────────
def plot_eda(ratings, movies, users, train_df, val_df, test_df, pos_df):
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle(
        'MovieLens 1M — Dataset Overview (EDA)',
        fontsize=14, fontweight='bold', y=0.98,
    )

    # ── 1. Rating score distribution ──────────────────────────
    ax = axes[0, 0]
    counts = ratings['rating'].value_counts().sort_index()
    bar_colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6']
    bars = ax.bar(counts.index, counts.values,
                  color=bar_colors, edgecolor='white', linewidth=0.5)
    for bar, val in zip(bars, counts.values):
        ax.text(bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 6000,
                f'{val/1000:.0f}K',
                ha='center', va='bottom', fontsize=9)
    ax.axvline(x=3.5, color='#f43f5e', linestyle='--',
               linewidth=1.8, label='Threshold ≥ 4 (positive)')
    pos_pct = (ratings['rating'] >= 4).mean() * 100
    ax.text(4.6, counts.max() * 0.82,
            f'Positive\n{pos_pct:.1f}%',
            color='#14b8a6', fontsize=9.5,
            ha='center', fontweight='bold')
    ax.set_xlabel('Rating Score', fontsize=10)
    ax.set_ylabel('Number of Ratings', fontsize=10)
    ax.set_title('Rating Score Distribution', fontsize=11, fontweight='bold')
    ax.legend(fontsize=9)
    ax.set_xticks([1, 2, 3, 4, 5])

    # ── 2. Movies per user (activity distribution) ────────────
    ax = axes[0, 1]
    movies_per_user = ratings.groupby('user_id')['movie_id'].count()
    ax.hist(movies_per_user, bins=60,
            color='#6366f1', edgecolor='white', linewidth=0.3, alpha=0.85)
    med = movies_per_user.median()
    mn  = movies_per_user.mean()
    ax.axvline(med, color='#f59e0b', linestyle='--',
               linewidth=1.8, label=f'Median: {int(med)} movies')
    ax.axvline(mn,  color='#f43f5e', linestyle='-.',
               linewidth=1.8, label=f'Mean: {mn:.0f} movies')
    ax.set_xlabel('Number of Movies Rated per User', fontsize=10)
    ax.set_ylabel('Number of Users', fontsize=10)
    ax.set_title('User Activity Distribution', fontsize=11, fontweight='bold')
    ax.legend(fontsize=9)

    # ── 3. Genre distribution (top 18) ────────────────────────
    ax = axes[1, 0]
    genre_counts = {}
    for g_str in movies['genres']:
        for g in str(g_str).split('|'):
            g = g.strip()
            if g:
                genre_counts[g] = genre_counts.get(g, 0) + 1
    genre_series = (pd.Series(genre_counts)
                    .sort_values(ascending=True)
                    .tail(18))
    top5 = set(pd.Series(genre_counts).nlargest(5).index)
    bar_g_colors = ['#14b8a6' if g in top5 else '#475569'
                    for g in genre_series.index]
    bars_g = ax.barh(genre_series.index, genre_series.values,
                     color=bar_g_colors, edgecolor='white', linewidth=0.3)
    for bar, val in zip(bars_g, genre_series.values):
        ax.text(val + 3, bar.get_y() + bar.get_height() / 2,
                str(val), va='center', fontsize=8)
    ax.set_xlabel('Number of Movies', fontsize=10)
    ax.set_title('Genre Distribution (Top 18)', fontsize=11, fontweight='bold')

    # ── 4. Train / Val / Test split ───────────────────────────
    ax = axes[1, 1]
    split_labels = ['Train\n(80%)', 'Validation\n(10%)', 'Test\n(10%)']
    split_sizes  = [len(train_df), len(val_df), len(test_df)]
    split_colors = ['#14b8a6', '#6366f1', '#f59e0b']
    wedges, texts, autotexts = ax.pie(
        split_sizes,
        labels=split_labels,
        colors=split_colors,
        autopct='%1.1f%%',
        startangle=90,
        wedgeprops={'edgecolor': 'white', 'linewidth': 1.5},
        textprops={'fontsize': 10},
    )
    for at in autotexts:
        at.set_fontsize(10)
        at.set_fontweight('bold')
    total = sum(split_sizes)
    ax.set_title(
        f'Train / Val / Test Split\n'
        f'Positive interactions: {total:,}  |  Split: per-user 80/10/10',
        fontsize=10, fontweight='bold',
    )

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    out_path = f'{RESULT_DIR}/eda_overview.png'
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'EDA chart saved: {out_path}')
    return pos_pct


# ─── Console summary ──────────────────────────────────────────
def print_summary(ratings, movies, users, train_df, val_df, test_df, pos_pct):
    movies_per_user = ratings.groupby('user_id')['movie_id'].count()
    users_per_movie = ratings.groupby('movie_id')['user_id'].count()
    sparsity = 1 - len(ratings) / (
        ratings['user_id'].nunique() * ratings['movie_id'].nunique()
    )

    print('\n' + '=' * 56)
    print('  MOVIELENS 1M — EDA SUMMARY')
    print('=' * 56)
    print(f'  Users                    : {ratings["user_id"].nunique():,}')
    print(f'  Movies                   : {ratings["movie_id"].nunique():,}')
    print(f'  Total interactions       : {len(ratings):,}')
    print(f'  Positive (rating >= 4)   : {(ratings["rating"] >= 4).sum():,}  ({pos_pct:.1f}%)')
    print(f'  Sparsity                 : {sparsity:.4f}  ({sparsity*100:.2f}%)')
    print(f'  Avg movies/user          : {movies_per_user.mean():.1f}  '
          f'(min {movies_per_user.min()}, max {movies_per_user.max()})')
    print(f'  Avg users/movie          : {users_per_movie.mean():.1f}  '
          f'(min {users_per_movie.min()}, max {users_per_movie.max()})')
    print(f'  Gender split             : '
          f'M={( users["gender"]=="M").sum():,}  '
          f'F={(users["gender"]=="F").sum():,}')
    print(f'  Train interactions       : {len(train_df):,}')
    print(f'  Val   interactions       : {len(val_df):,}')
    print(f'  Test  interactions       : {len(test_df):,}')
    print('=' * 56)


# ─── Main ─────────────────────────────────────────────────────
if __name__ == '__main__':
    print('Loading MovieLens 1M data...')
    ratings, movies, users = load_data()

    print('Reproducing train/val/test split (same as train.py)...')
    train_df, val_df, test_df, pos_df = reproduce_split(ratings)

    print('Generating EDA charts...')
    pos_pct = plot_eda(ratings, movies, users, train_df, val_df, test_df, pos_df)

    print_summary(ratings, movies, users, train_df, val_df, test_df, pos_pct)