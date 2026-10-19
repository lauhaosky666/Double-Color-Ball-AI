#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从上游 sinyu1012/Double-Color-Ball-AI 同步开奖数据与 AI 预测。

用 gh api 直读，绕过 raw.githubusercontent.com 在部分网络下的访问限制。
"""

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UPSTREAM = "sinyu1012/Double-Color-Ball-AI"
GH_BIN = shutil.which("gh") or str(Path.home() / ".local" / "bin" / "gh")
FILES = (
    "data/lottery_history.json",
    "data/ai_predictions.json",
    "data/predictions_history.json",
)


def fetch_json(repo_path):
    proc = subprocess.run(
        [
            GH_BIN,
            "api",
            f"repos/{UPSTREAM}/contents/{repo_path}",
            "-H",
            "Accept: application/vnd.github.raw",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()[:300]
        raise RuntimeError(f"{repo_path}: {detail}")
    return json.loads(proc.stdout)


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    for rel in FILES:
        data = fetch_json(rel)
        dest = ROOT / rel
        if dest.exists():
            backup = dest.with_name(f"{dest.stem}_backup_{stamp}{dest.suffix}")
            backup.write_text(dest.read_text(encoding="utf-8"), encoding="utf-8")
        dest.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"✓ {rel}")

    history = json.loads((ROOT / "data/lottery_history.json").read_text(encoding="utf-8"))
    preds = json.loads((ROOT / "data/ai_predictions.json").read_text(encoding="utf-8"))
    latest = history["data"][0]
    print(f"最新开奖: {latest['period']} ({latest['date']})")
    print(f"预测目标: {preds.get('target_period')} ({preds.get('prediction_date')})")
    names = [m.get("model_name") or m.get("model_id") for m in preds.get("models", [])]
    print("模型:", "、".join(names))

    subprocess.run(
        [sys.executable, str(ROOT / "ensemble_prediction.py")], check=True
    )


if __name__ == "__main__":
    main()
