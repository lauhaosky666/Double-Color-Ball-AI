#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""离线规则预测：不调用任何 AI 接口，直接用 prediction_rules 生成下一期号码。

输出格式与 generate_ai_prediction.py 保持一致，网页可直接读取。
已有同期的 AI 预测会被保留，规则引擎结果作为额外一个模型追加。
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from prediction_rules import build_prediction_plan

HISTORY_FILE = ROOT / "data/lottery_history.json"
PREDICTIONS_FILE = ROOT / "data/ai_predictions.json"
# 每组取首选候选，共 5 组，与网页其他模型的展示格式一致
CANDIDATES_PER_GROUP = 1
MODEL_ID = "rule-engine-offline"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def backup_existing():
    if not PREDICTIONS_FILE.exists():
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    backup = PREDICTIONS_FILE.with_name(
        f"{PREDICTIONS_FILE.stem}_backup_{stamp}{PREDICTIONS_FILE.suffix}"
    )
    backup.write_text(PREDICTIONS_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"已备份旧预测: {backup.name}")


def build_rule_model(draws, target_period, target_date):
    plan = build_prediction_plan(draws)
    predictions = []
    for group_id in sorted(plan["options"], key=int):
        predictions.extend(plan["options"][group_id][:CANDIDATES_PER_GROUP])
    return {
        "model_id": MODEL_ID,
        "model_name": "规则引擎（离线）",
        "requested_model": "prediction_rules",
        "response_model": "prediction_rules",
        "validation_status": "passed",
        "predictions": predictions,
        "target_period": target_period,
        "prediction_date": target_date,
    }


def main():
    history = load_json(HISTORY_FILE)
    draws = history.get("data") or []
    if not draws:
        raise SystemExit("历史开奖数据为空，请先抓取数据")

    next_draw = history.get("next_draw") or {}
    target_period = next_draw.get("next_period")
    target_date = next_draw.get("next_date")
    if not target_period or not target_date:
        raise SystemExit("缺少 next_draw 信息，请先运行抓取脚本")

    rule_model = build_rule_model(draws, target_period, target_date)

    models = []
    if PREDICTIONS_FILE.exists():
        old = load_json(PREDICTIONS_FILE)
        if old.get("target_period") == target_period:
            models = [
                m for m in old.get("models", [])
                if m.get("model_id") != MODEL_ID
            ]
        backup_existing()

    models.append(rule_model)
    document = {
        "prediction_date": target_date,
        "target_period": target_period,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator_version": "offline-rules-1.0",
        "status": "offline",
        "failures": [],
        "models": models,
    }
    PREDICTIONS_FILE.write_text(
        json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    groups = len(rule_model["predictions"]) // CANDIDATES_PER_GROUP
    print(f"目标期号: {target_period}（{target_date}）")
    print(f"已生成 {groups} 组号码（每组取首选候选）")
    shown = set()
    for item in rule_model["predictions"]:
        if item["group_id"] in shown:
            continue
        shown.add(item["group_id"])
        reds = " ".join(item["red_balls"])
        print(f"  {item['strategy']}: {reds} + {item['blue_ball']}")
    print(f"已写入: {PREDICTIONS_FILE}")


if __name__ == "__main__":
    main()
