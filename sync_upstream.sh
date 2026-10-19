#!/bin/bash
# 从原作者仓库同步最新开奖数据与 AI 预测（需要 gh 已登录）
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$ROOT/.venv/bin/python" "$ROOT/sync_upstream.py"
