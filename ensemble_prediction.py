#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""频率共识模型：汇总所有模型与规则引擎的推荐，按号码出现频率生成 3 组号码。"""

import itertools
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREDICTIONS_FILE = ROOT / "data/ai_predictions.json"
MODEL_ID = "frequency-consensus"
MODEL_NAME = "频率共识（本地）"
GROUP_COUNT = 3
POOL_SIZE = 12
MAX_OVERLAP = 4  # 任意两组最多重 4 个红球


def main():
    doc = json.loads(PREDICTIONS_FILE.read_text(encoding="utf-8"))
    models = doc.get("models", [])
    sources = [m for m in models if m.get("model_id") != MODEL_ID]
    predictions = [p for m in sources for p in m.get("predictions", [])]
    if not predictions:
        raise SystemExit("没有可用的模型预测，无法生成频率共识")

    red_counts = Counter()
    blue_counts = Counter()
    for item in predictions:
        red_counts.update(item.get("red_balls", []))
        blue = item.get("blue_ball")
        if blue:
            blue_counts[blue] += 1

    ranked_red = sorted(red_counts, key=lambda n: (-red_counts[n], int(n)))
    ranked_blue = sorted(blue_counts, key=lambda n: (-blue_counts[n], int(n)))
    pool = ranked_red[:POOL_SIZE]

    scored = []
    for combo in itertools.combinations(sorted(pool, key=int), 6):
        score = sum(red_counts[n] for n in combo)
        scored.append((score, combo))
    scored.sort(key=lambda item: (-item[0], [int(n) for n in item[1]]))

    chosen = []
    for score, combo in scored:
        if all(len(set(combo) & set(prev)) <= MAX_OVERLAP for _, prev in chosen):
            chosen.append((score, combo))
            if len(chosen) == GROUP_COUNT:
                break
    if len(chosen) < GROUP_COUNT:
        for score, combo in scored:
            if (score, combo) not in chosen:
                chosen.append((score, combo))
                if len(chosen) == GROUP_COUNT:
                    break

    result = []
    for index, (score, combo) in enumerate(chosen, start=1):
        blue = ranked_blue[(index - 1) % len(ranked_blue)] if ranked_blue else ""
        result.append(
            {
                "candidate_id": f"F-{index}",
                "group_id": index,
                "strategy": f"频率共识 #{index}",
                "red_balls": list(combo),
                "blue_ball": blue,
                "description": (
                    f"汇总 {len(sources)} 个模型共 {len(predictions)} 组推荐；"
                    f"红球频次合计 {score}；蓝球 {blue} 出现 {blue_counts.get(blue, 0)} 次"
                ),
            }
        )

    model = {
        "model_id": MODEL_ID,
        "model_name": MODEL_NAME,
        "requested_model": "frequency-consensus",
        "response_model": "frequency-consensus",
        "validation_status": "passed",
        "predictions": result,
        "target_period": doc.get("target_period"),
        "prediction_date": doc.get("prediction_date"),
    }
    doc["models"] = [m for m in models if m.get("model_id") != MODEL_ID] + [model]
    doc["ensemble_generated_at"] = datetime.now(timezone.utc).isoformat()
    PREDICTIONS_FILE.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"汇总 {len(sources)} 个模型、{len(predictions)} 组推荐")
    print("红球频率前 12:", " ".join(f"{n}({red_counts[n]})" for n in pool))
    print("蓝球频率前 5 :", " ".join(f"{n}({blue_counts[n]})" for n in ranked_blue[:5]))
    for item in result:
        print(f"  {item['strategy']}: {' '.join(item['red_balls'])} + {item['blue_ball']}")


if __name__ == "__main__":
    main()
