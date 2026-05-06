import os
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from train import (
    download_dataset, load_dataset, preprocess,
    build_edge_index, train_model,
    MatrixFactorization, NGCF, LightGCN,
    EMB_DIM, BATCH_SIZE, LR, RESULT_DIR, device,
)

PATIENCE_VALUES = [3, 5, 10, 20]


def run_patience_experiment(patience_val,
                             train_df, num_users, num_movies,
                             edge_index, train_user_items, test_user_items):
    """Train all 3 models at one patience value. Checkpoints go to a sub-folder."""
    results = {}

    mf = MatrixFactorization(num_users, num_movies, EMB_DIM)
    _, res, _ = train_model(
        mf, f'patience_{patience_val}/mf',
        train_df, num_users, num_movies,
        train_user_items, test_user_items,
        max_epochs=500, batch_size=BATCH_SIZE, lr=LR,
        patience=patience_val,
    )
    results['MF'] = res

    ngcf = NGCF(num_users, num_movies, EMB_DIM, n_layers=3)
    _, res, _ = train_model(
        ngcf, f'patience_{patience_val}/ngcf',
        train_df, num_users, num_movies,
        train_user_items, test_user_items,
        edge_index=edge_index, max_epochs=500,
        batch_size=BATCH_SIZE, lr=LR,
        patience=patience_val,
    )
    results['NGCF'] = res

    lgcn = LightGCN(num_users, num_movies, EMB_DIM, n_layers=3)
    _, res, _ = train_model(
        lgcn, f'patience_{patience_val}/lightgcn',
        train_df, num_users, num_movies,
        train_user_items, test_user_items,
        edge_index=edge_index, max_epochs=500,
        batch_size=BATCH_SIZE, lr=LR,
        patience=patience_val,
    )
    results['LightGCN'] = res

    return results


def plot_patience_sensitivity(all_results):
    """One subplot per metric, one line per model, x-axis = patience value."""
    patience_vals = sorted(all_results.keys())
    models   = ['MF', 'NGCF', 'LightGCN']
    metrics  = ['NDCG@10', 'Precision@10', 'Recall@10']
    colors   = {'MF': '#5b8db8', 'NGCF': '#9b59b6', 'LightGCN': '#27ae60'}
    markers  = {'MF': 'o', 'NGCF': 's', 'LightGCN': '^'}
    labels   = {'MF': 'Matrix Factorization', 'NGCF': 'NGCF', 'LightGCN': 'LightGCN'}

    fig, axes = plt.subplots(1, 3, figsize=(15, 5))

    for ax, metric in zip(axes, metrics):
        for model in models:
            values = [all_results[p][model][metric] for p in patience_vals]
            ax.plot(
                patience_vals, values,
                label=labels[model],
                color=colors[model],
                marker=markers[model],
                linewidth=2,
                markersize=8,
            )
            # Annotate each point with its value
            for x, y in zip(patience_vals, values):
                ax.annotate(f'{y:.4f}', (x, y),
                            textcoords='offset points', xytext=(0, 8),
                            ha='center', fontsize=8)

        ax.set_xlabel('Early Stopping Patience', fontsize=12)
        ax.set_ylabel(metric, fontsize=12)
        ax.set_title(f'{metric} vs Patience', fontsize=13)
        ax.set_xticks(patience_vals)
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)

    plt.suptitle(
        'Early Stopping Patience Sensitivity Analysis\n'
        '(max_epochs=500, emb_dim=64, batch_size=2048, lr=1e-3 — same for all models)',
        fontsize=12, fontweight='bold',
    )
    plt.tight_layout()
    out_path = f'{RESULT_DIR}/patience_sensitivity.png'
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'\nChart saved → {out_path}')


def print_summary_table(all_results):
    patience_vals = sorted(all_results.keys())
    models = ['MF', 'NGCF', 'LightGCN']
    header = f'  {"Model":<14} {"Patience":>9} {"NDCG@10":>10} {"Prec@10":>10} {"Rec@10":>10}'
    print('\n' + '=' * 60)
    print(header)
    print('=' * 60)
    for p in patience_vals:
        for model in models:
            m = all_results[p][model]
            print(f'  {model:<14} {p:>9} '
                  f'{m["NDCG@10"]:>10.4f} '
                  f'{m["Precision@10"]:>10.4f} '
                  f'{m["Recall@10"]:>10.4f}')
        print('-' * 60)


def main():
    download_dataset()
    ratings, movies, users = load_dataset()
    train_df, val_df, test_df, num_users, num_movies, idx2movie = preprocess(ratings)

    edge_index       = build_edge_index(train_df, num_users).to(device)
    train_user_items = train_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()
    test_user_items  = test_df.groupby('user_idx')['movie_idx'].apply(set).to_dict()

    all_results = {}

    for patience_val in PATIENCE_VALUES:
        print(f'\n{"=" * 60}')
        print(f'  PATIENCE = {patience_val}  (evaluation every 5 epochs → stops after {patience_val * 5} non-improving epochs)')
        print('=' * 60)
        all_results[patience_val] = run_patience_experiment(
            patience_val,
            train_df, num_users, num_movies,
            edge_index, train_user_items, test_user_items,
        )

    print_summary_table(all_results)

    json_path = f'{RESULT_DIR}/patience_sensitivity.json'
    with open(json_path, 'w') as f:
        json.dump(
            {str(p): {m: {k: float(v) for k, v in vals.items()}
                      for m, vals in res.items()}
             for p, res in all_results.items()},
            f, indent=2,
        )
    print(f'\nRaw results saved → {json_path}')

    plot_patience_sensitivity(all_results)


if __name__ == '__main__':
    main()
