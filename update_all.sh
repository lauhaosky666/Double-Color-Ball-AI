#!/bin/bash
# 一条命令完成：抓取最新开奖号码 + 生成下一期规则预测（无需 AI Key）
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "== 1/2 抓取最新开奖号码 =="
(cd fetch_history && "$ROOT/.venv/bin/python" fetch_lottery_history.py)

echo
echo "== 2/2 生成下一期规则预测 =="
"$ROOT/.venv/bin/python" offline_prediction.py

echo
echo "完成。打开或刷新 http://localhost:8000 查看。"
