#!/bin/bash
# 一条命令完成：抓取最新开奖 + 规则预测 + 频率共识（无需 AI Key）
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "== 1/3 同步原作者数据与 AI 预测 =="
if "$ROOT/.venv/bin/python" "$ROOT/sync_upstream.py"; then
    echo "✓ 上游同步成功"
else
    echo "! 上游同步失败，回退本地抓取"
    (cd fetch_history && "$ROOT/.venv/bin/python" fetch_lottery_history.py)
fi

echo
echo "== 2/3 生成下一期规则预测 =="
"$ROOT/.venv/bin/python" offline_prediction.py

echo
echo "== 3/3 生成频率共识号码 =="
"$ROOT/.venv/bin/python" ensemble_prediction.py

echo
echo "完成。打开或刷新 http://localhost:8000 查看。"
