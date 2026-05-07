"""
Model Analysis — Architecture Comparison & Metrics Visualization
Loads checkpoints from gnn_training/checkpoints/ (no retraining).

Usage:
    python gnn_training/model_analysis.py

Outputs (saved to gnn_training/results/):
    metrics_comparison.png   — bar chart: Precision / Recall / NDCG for 3 models
    model_complexity.png     — parameter count + architecture comparison
"""

import os
import json
import torch
import numpy as np

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

BASE_DIR   = './gnn_training'
CKPT_DIR   = f'{BASE_DIR}/checkpoints'
RESULT_DIR = f'{BASE_DIR}/results'
os.makedirs(RESULT_DIR, exist_ok=True)


# ─── Load results ──────────────────────────────────────────────
def load_results():
    with open(f'{RESULT_DIR}/results.json') as f:
        return json.load(f)


# ─── Count model parameters ────────────────────────────────────
def count_params(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def load_models_for_analysis():
    """Load all 3 model checkpoints; return {name: model}."""
    # Import models directly from train.py
    import sys
    sys.path.insert(0, BASE_DIR)
    from train import MatrixFactorization, NGCF, LightGCN, EMB_DIM

    # Dataset sizes (hardcoded from ML-1M after preprocessing)
    NUM_USERS  = 6040
    NUM_MOVIES = 3706

    models = {}

    mf = MatrixFactorization(NUM_USERS, NUM_MOVIES, EMB_DIM)
    ckpt = torch.load(f'{CKPT_DIR}/mf_model.pt', map_location='cpu', weights_only=False)
    mf.load_state_dict(ckpt['model_state_dict'])
    models['Matrix Factorization'] = mf

    ngcf = NGCF(NUM_USERS, NUM_MOVIES, EMB_DIM, n_layers=3)
    ckpt = torch.load(f'{CKPT_DIR}/ngcf_model.pt', map_location='cpu', weights_only=False)
    ngcf.load_state_dict(ckpt['model_state_dict'])
    models['NGCF'] = ngcf

    lgcn = LightGCN(NUM_USERS, NUM_MOVIES, EMB_DIM, n_layers=3)
    ckpt = torch.load(f'{CKPT_DIR}/lightgcn_model.pt', map_location='cpu', weights_only=False)
    lgcn.load_state_dict(ckpt['model_state_dict'])
    models['LightGCN'] = lgcn

    return models


# ─── Chart 1: Metrics comparison bar chart ─────────────────────
def plot_metrics_comparison(results):
    model_names  = ['Matrix Factorization', 'NGCF', 'LightGCN']
    short_names  = ['MF\n(baseline)', 'NGCF\n(GNN baseline)', 'LightGCN\n(proposed)']
    metrics      = ['Precision@10', 'Recall@10', 'NDCG@10']
    model_colors = {
        'Matrix Factorization': '#f59e0b',
        'NGCF'                : '#8b5cf6',
        'LightGCN'            : '#14b8a6',
    }

    fig, axes = plt.subplots(1, 3, figsize=(14, 6))
    fig.suptitle(
        'Model Performance Comparison on MovieLens 1M (Top-10)',
        fontsize=13, fontweight='bold', y=1.01,
    )

    for ax, metric in zip(axes, metrics):
        values = [results[m][metric] for m in model_names]
        colors = [model_colors[m] for m in model_names]
        bars   = ax.bar(short_names, values, color=colors,
                        edgecolor='white', linewidth=0.8, width=0.55)

        # Value labels on bars
        for bar, val in zip(bars, values):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.001,
                f'{val:.4f}',
                ha='center', va='bottom', fontsize=10, fontweight='bold',
            )

        # Highlight best bar
        best_idx = int(np.argmax(values))
        bars[best_idx].set_edgecolor('#f1f5f9')
        bars[best_idx].set_linewidth(2.5)

        # Improvement over MF
        mf_val = values[0]
        lgcn_val = values[2]
        delta = (lgcn_val - mf_val) / mf_val * 100
        ax.text(
            0.98, 0.96,
            f'LightGCN vs MF:\n+{delta:.1f}%',
            transform=ax.transAxes,
            ha='right', va='top',
            fontsize=8.5, color='#14b8a6',
            bbox=dict(boxstyle='round,pad=0.3',
                      facecolor=(0.08, 0.72, 0.65, 0.1),
                      edgecolor=(0.08, 0.72, 0.65, 0.4)),
        )

        ax.set_title(metric, fontsize=12, fontweight='bold')
        ax.set_ylabel('Score', fontsize=10)
        ax.set_ylim(0, max(values) * 1.2)
        ax.grid(axis='y', alpha=0.3)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)

    plt.tight_layout()
    out_path = f'{RESULT_DIR}/metrics_comparison.png'
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'Metrics chart saved: {out_path}')


# ─── Chart 2: Model complexity comparison ──────────────────────
def plot_model_complexity(models, results):
    model_names  = ['Matrix Factorization', 'NGCF', 'LightGCN']
    short_labels = ['MF', 'NGCF', 'LightGCN']
    model_colors = ['#f59e0b', '#8b5cf6', '#14b8a6']

    param_counts = {name: count_params(m) for name, m in models.items()}
    ndcg_values  = [results[m]['NDCG@10'] for m in model_names]
    params_k     = [param_counts[m] / 1000 for m in model_names]

    fig, axes = plt.subplots(1, 2, figsize=(13, 6))
    fig.suptitle(
        'Model Complexity vs Performance',
        fontsize=13, fontweight='bold',
    )

    # ── Left: Parameter count bar chart ────────────────────────
    ax = axes[0]
    bars = ax.bar(short_labels, params_k,
                  color=model_colors, edgecolor='white', linewidth=0.8, width=0.5)
    for bar, val in zip(bars, params_k):
        ax.text(bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 1,
                f'{val:.1f}K',
                ha='center', va='bottom', fontsize=11, fontweight='bold')
    ax.set_title('Number of Trainable Parameters', fontsize=11, fontweight='bold')
    ax.set_ylabel('Parameters (thousands)', fontsize=10)
    ax.set_ylim(0, max(params_k) * 1.25)
    ax.grid(axis='y', alpha=0.3)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    # ── Right: Params vs NDCG scatter ──────────────────────────
    ax = axes[1]
    for i, (name, sname) in enumerate(zip(model_names, short_labels)):
        ax.scatter(params_k[i], ndcg_values[i],
                   color=model_colors[i], s=180, zorder=5,
                   edgecolors='white', linewidths=1.5,
                   label=name)
        ax.annotate(
            sname,
            (params_k[i], ndcg_values[i]),
            textcoords='offset points',
            xytext=(10, 4),
            fontsize=11, fontweight='bold', color=model_colors[i],
        )

    ax.set_xlabel('Number of Parameters (thousands)', fontsize=10)
    ax.set_ylabel('NDCG@10', fontsize=10)
    ax.set_title('Parameters vs NDCG@10\n(top-right = better)', fontsize=11, fontweight='bold')
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()
    out_path = f'{RESULT_DIR}/model_complexity.png'
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'Complexity chart saved: {out_path}')


# ─── Chart 3: Convergence epoch visualization ──────────────────
def plot_convergence():
    """
    Read best_epoch and best_ndcg from checkpoints and plot:
      Left  — convergence epoch (how many epochs each model needed)
      Right — best NDCG@10 at convergence (what each model achieved)
    Tells the story: LightGCN trains longer but reaches a better optimum.
    """
    model_labels = ['MF\n(baseline)', 'NGCF\n(GNN baseline)', 'LightGCN\n(proposed)']
    ckpt_files   = ['mf_model', 'ngcf_model', 'lightgcn_model']
    colors       = ['#f59e0b', '#8b5cf6', '#14b8a6']

    epochs, ndcgs = [], []
    for fname in ckpt_files:
        ckpt = torch.load(f'{CKPT_DIR}/{fname}.pt', map_location='cpu', weights_only=False)
        epochs.append(ckpt.get('epoch', 0))
        ndcgs.append(ckpt.get('best_ndcg', 0.0))

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle(
        'Training Convergence: Epochs Needed vs Performance Achieved',
        fontsize=13, fontweight='bold',
    )

    # ── Left: convergence epoch ─────────────────────────────────
    ax = axes[0]
    bars = ax.bar(model_labels, epochs, color=colors,
                  edgecolor='white', linewidth=0.8, width=0.5)
    for bar, val in zip(bars, epochs):
        ax.text(bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 3,
                f'epoch {val}',
                ha='center', va='bottom', fontsize=11, fontweight='bold')

    # Annotation explaining LightGCN's longer training
    ax.annotate(
        'Needs more epochs\nbut avoids overfitting\n(no W1/W2 transforms)',
        xy=(2, epochs[2]),
        xytext=(1.3, epochs[2] * 0.75),
        arrowprops=dict(arrowstyle='->', color='#14b8a6', lw=1.5),
        fontsize=8.5, color='#14b8a6', ha='center',
    )
    ax.set_ylabel('Best Epoch (early stopping)', fontsize=10)
    ax.set_title('Convergence Epoch', fontsize=11, fontweight='bold')
    ax.set_ylim(0, max(epochs) * 1.3)
    ax.grid(axis='y', alpha=0.3)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    # ── Right: NDCG at convergence ──────────────────────────────
    ax = axes[1]
    bars = ax.bar(model_labels, ndcgs, color=colors,
                  edgecolor='white', linewidth=0.8, width=0.5)

    # Highlight best bar with thick border
    best_idx = int(max(range(len(ndcgs)), key=lambda i: ndcgs[i]))
    bars[best_idx].set_edgecolor('#f1f5f9')
    bars[best_idx].set_linewidth(2.5)

    for bar, val in zip(bars, ndcgs):
        ax.text(bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.0005,
                f'{val:.4f}',
                ha='center', va='bottom', fontsize=11, fontweight='bold')

    # Delta annotation
    delta_mf   = (ndcgs[2] - ndcgs[0]) / ndcgs[0] * 100
    delta_ngcf = (ndcgs[2] - ndcgs[1]) / ndcgs[1] * 100
    ax.text(0.98, 0.08,
            f'vs MF:   +{delta_mf:.1f}%\nvs NGCF: +{delta_ngcf:.1f}%',
            transform=ax.transAxes,
            ha='right', va='bottom', fontsize=9, color='#14b8a6',
            bbox=dict(boxstyle='round,pad=0.35',
                      facecolor='white', alpha=0.7, edgecolor='#e2e8f0'))

    ax.set_ylabel('Best NDCG@10', fontsize=10)
    ax.set_title('NDCG@10 at Convergence', fontsize=11, fontweight='bold')
    ax.set_ylim(0, max(ndcgs) * 1.2)
    ax.grid(axis='y', alpha=0.3)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()
    out_path = f'{RESULT_DIR}/convergence_epochs.png'
    plt.savefig(out_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f'Convergence chart saved: {out_path}')


# ─── Console summary ───────────────────────────────────────────
def print_full_summary(models, results):
    model_names = ['Matrix Factorization', 'NGCF', 'LightGCN']

    # Architecture details
    arch_info = {
        'Matrix Factorization': {
            'type'       : 'Non-graph baseline',
            'layers'     : '—  (no GNN layers)',
            'conv_weights': 'None',
            'emb_concat' : 'No',
        },
        'NGCF': {
            'type'       : 'GNN with feature transform',
            'layers'     : '3 propagation layers',
            'conv_weights': 'W1 + W2 per layer (learnable)',
            'emb_concat' : 'Concatenate all layer outputs',
        },
        'LightGCN': {
            'type'       : 'Simplified GNN (no transform)',
            'layers'     : '3 propagation layers',
            'conv_weights': 'None (only degree normalization)',
            'emb_concat' : 'Average all layer outputs',
        },
    }

    print('\n' + '=' * 70)
    print('  MODEL ARCHITECTURE & COMPLEXITY SUMMARY')
    print('=' * 70)
    header = f'  {"Model":<24} {"Params":>10} {"Prec@10":>10} {"Rec@10":>10} {"NDCG@10":>10}'
    print(header)
    print('-' * 70)
    for name in model_names:
        p = sum(m.numel() for m in models[name].parameters() if m.requires_grad)
        r = results[name]
        print(f'  {name:<24} {p:>10,} '
              f'{r["Precision@10"]:>10.4f} '
              f'{r["Recall@10"]:>10.4f} '
              f'{r["NDCG@10"]:>10.4f}')
    print('=' * 70)

    # LightGCN vs MF improvement
    lgcn_ndcg = results['LightGCN']['NDCG@10']
    mf_ndcg   = results['Matrix Factorization']['NDCG@10']
    lgcn_params = sum(m.numel() for m in models['LightGCN'].parameters() if m.requires_grad)
    ngcf_params = sum(m.numel() for m in models['NGCF'].parameters() if m.requires_grad)

    print(f'\n  Key insight for defense:')
    print(f'  LightGCN vs MF  : NDCG@10 +{(lgcn_ndcg-mf_ndcg)/mf_ndcg*100:.1f}%  with similar param count')
    print(f'  LightGCN vs NGCF: {lgcn_params:,} params vs {ngcf_params:,}  '
          f'(LightGCN has {ngcf_params-lgcn_params:,} fewer params yet performs better)')
    print(f'  => Removing W1/W2 linear transforms in GNN layers improves CF performance')
    print()

    print('  Architecture differences:')
    for name in model_names:
        info = arch_info[name]
        print(f'\n  [{name}]')
        for k, v in info.items():
            print(f'    {k:<16}: {v}')

    # Checkpoint epoch info
    print('\n  Convergence (best epoch per checkpoint):')
    for fname, label in [('mf_model', 'MF'), ('ngcf_model', 'NGCF'), ('lightgcn_model', 'LightGCN')]:
        ckpt_path = f'{CKPT_DIR}/{fname}.pt'
        if os.path.exists(ckpt_path):
            ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=False)
            epoch     = ckpt.get('epoch', '?')
            best_ndcg = ckpt.get('best_ndcg', '?')
            ndcg_str  = f'{best_ndcg:.4f}' if isinstance(best_ndcg, float) else str(best_ndcg)
            print(f'    {label:<22}: best epoch = {epoch:>4},  best NDCG@10 = {ndcg_str}')

    print()


# ─── Main ──────────────────────────────────────────────────────
if __name__ == '__main__':
    print('Loading results...')
    results = load_results()

    print('Loading model checkpoints (no retraining)...')
    models = load_models_for_analysis()

    print('Generating metrics comparison chart...')
    plot_metrics_comparison(results)

    print('Generating model complexity chart...')
    plot_model_complexity(models, results)

    print('Generating convergence chart...')
    plot_convergence()

    print_full_summary(models, results)

    print('Done. All charts saved to gnn_training/results/')
