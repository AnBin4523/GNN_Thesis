import os
import sys

# Allow running from either project root or gnn_training/ directory
_SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
os.chdir(_PROJECT_ROOT)          # train.py paths use './gnn_training/...'
sys.path.insert(0, _SCRIPT_DIR)  # so 'from train import' resolves

import json
import numpy as np
import pandas as pd
import torch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from train import (
    download_dataset, load_dataset, preprocess,
    build_edge_index, evaluate_model,
    MatrixFactorization, NGCF, LightGCN,
    precision_at_k, recall_at_k, ndcg_at_k,
    EMB_DIM, CKPT_DIR, RESULT_DIR, device,
)


# ─── Popularity baseline ────────────────────────────────────────
class PopularityRecommender:
    """Recommend globally most-rated movies (non-personalised)."""

    def fit(self, train_df):
        counts = train_df.groupby('movie_idx').size()
        self.sorted_movies = counts.sort_values(ascending=False).index.tolist()

    def recommend(self, user_idx, train_user_items, k=10):
        seen = train_user_items.get(user_idx, set())
        return [m for m in self.sorted_movies if m not in seen][:k]

    def evaluate(self, train_user_items, test_user_items, k=10):
        prec, rec, ndcg = [], [], []
        for uid, relevant in test_user_items.items():
            recs = self.recommend(uid, train_user_items, k)
            prec.append(precision_at_k(recs, relevant, k))
            rec.append(recall_at_k(recs, relevant, k))
            ndcg.append(ndcg_at_k(recs, relevant, k))
        return {
            f'Precision@{k}': float(np.mean(prec)),
            f'Recall@{k}':    float(np.mean(rec)),
            f'NDCG@{k}':      float(np.mean(ndcg)),
        }


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
        'Matrix Factorization': _load(
            MatrixFactorization(num_users, num_movies, EMB_DIM), 'mf_model'),
        'NGCF': _load(
            NGCF(num_users, num_movies, EMB_DIM, n_layers=3), 'ngcf_model'),
        'LightGCN': _load(
            LightGCN(num_users, num_movies, EMB_DIM, n_layers=3), 'lightgcn_model'),
    }


# ─── Chart ──────────────────────────────────────────────────────
def plot_comparison(all_results):
    model_order = ['Popularity', 'Matrix Factorization', 'NGCF', 'LightGCN']
    short_labels = ['Popularity', 'MF', 'NGCF', 'LightGCN']
    metrics      = ['Precision@10', 'Recall@10', 'NDCG@10']
    colors       = ['#94a3b8', '#5b8db8', '#9b59b6', '#27ae60']

    fig, axes = plt.subplots(1, 3, figsize=(15, 6))

    for ax, metric in zip(axes, metrics):
        vals = [all_results[m][metric] for m in model_order]
        bars = ax.bar(
            range(len(model_order)), vals,
            color=colors, edgecolor='white', linewidth=0.5,
        )
        # Value labels above each bar
        for bar, val in zip(bars, vals):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.001,
                f'{val:.4f}',
                ha='center', va='bottom', fontsize=9, fontweight='bold',
            )
        # Improvement of LightGCN over Popularity
        pop_val  = vals[0]
        lgcn_val = vals[-1]
        gain_pct = (lgcn_val - pop_val) / pop_val * 100
        ax.annotate(
            f'+{gain_pct:.1f}%\nvs Popularity',
            xy=(3, lgcn_val), xytext=(2.5, lgcn_val + 0.012),
            fontsize=8, color='#27ae60', fontweight='bold',
            arrowprops=dict(arrowstyle='->', color='#27ae60', lw=1.2),
        )
        # Highlight best bar
        best_idx = int(np.argmax(vals))
        bars[best_idx].set_edgecolor('#f59e0b')
        bars[best_idx].set_linewidth(2.5)

        ax.set_xticks(range(len(model_order)))
        ax.set_xticklabels(short_labels, fontsize=10)
        ax.set_ylabel(metric, fontsize=11)
        ax.set_title(f'{metric}', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='y')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)

    plt.suptitle(
        'Baseline Comparison: Popularity vs Collaborative Filtering Models\n'
        '(Orange border = best; Popularity = non-personalised; '
        'MF / NGCF / LightGCN = personalised BPR)',
        fontsize=12, fontweight='bold',
    )
    plt.tight_layout()
    out = f'{RESULT_DIR}/baseline_comparison.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'Chart saved: {out}')


# ─── Console summary ────────────────────────────────────────────
def print_table(all_results):
    order = ['Popularity', 'Matrix Factorization', 'NGCF', 'LightGCN']
    print('\n' + '=' * 62)
    print(f'  {"Model":<24} {"Prec@10":>9} {"Rec@10":>9} {"NDCG@10":>9}')
    print('=' * 62)
    pop = all_results['Popularity']
    for name in order:
        r = all_results[name]
        gain = ''
        if name != 'Popularity':
            g = (r['NDCG@10'] - pop['NDCG@10']) / pop['NDCG@10'] * 100
            gain = f'  (+{g:.1f}% NDCG)'
        print(f'  {name:<24} {r["Precision@10"]:>9.4f} '
              f'{r["Recall@10"]:>9.4f} {r["NDCG@10"]:>9.4f}{gain}')
    print('=' * 62)


# ─── Main ───────────────────────────────────────────────────────
def main():
    download_dataset()
    ratings, movies, users = load_dataset()
    train_df, val_df, test_df, num_users, num_movies, idx2movie = preprocess(ratings)

    edge_index       = build_edge_index(train_df, num_users).to(device)
    train_user_items = train_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()
    test_user_items  = test_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()

    # Popularity baseline
    print('\nEvaluating Popularity baseline ...')
    pop = PopularityRecommender()
    pop.fit(train_df)
    pop_res = pop.evaluate(train_user_items, test_user_items, k=10)
    print(f'  Precision@10: {pop_res["Precision@10"]:.4f}')
    print(f'  Recall@10   : {pop_res["Recall@10"]:.4f}')
    print(f'  NDCG@10     : {pop_res["NDCG@10"]:.4f}')

    # GNN models
    print('\nLoading GNN checkpoints ...')
    models = load_models(num_users, num_movies, edge_index)

    all_results = {'Popularity': pop_res}
    for name, model in models.items():
        print(f'Evaluating {name} ...')
        res = evaluate_model(model, num_users, num_movies,
                             train_user_items, test_user_items)
        all_results[name] = {k: float(v) for k, v in res.items()}
        print(f'  Precision@10: {res["Precision@10"]:.4f}  '
              f'Recall@10: {res["Recall@10"]:.4f}  '
              f'NDCG@10: {res["NDCG@10"]:.4f}')

    print_table(all_results)

    json_path = f'{RESULT_DIR}/baseline_results.json'
    with open(json_path, 'w') as f:
        json.dump(all_results, f, indent=2)
    print(f'\nJSON saved: {json_path}')

    plot_comparison(all_results)


if __name__ == '__main__':
    main()