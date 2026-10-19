#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地服务：静态页面 + /api/update（抓开奖 + 规则预测）。

只绑定 127.0.0.1，避免把执行脚本的接口暴露到局域网。
"""

import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / ".venv" / "bin" / "python"
HOST, PORT = "127.0.0.1", 8000


def run_step(cmd, cwd, timeout):
    proc = subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[-800:]
        raise RuntimeError(f"{Path(cmd[-1]).name} 失败: {detail}")
    return proc.stdout


def update_all():
    run_step([str(PYTHON), "fetch_lottery_history.py"], ROOT / "fetch_history", 180)
    run_step([str(PYTHON), "offline_prediction.py"], ROOT, 120)

    history = json.loads((ROOT / "data/lottery_history.json").read_text(encoding="utf-8"))
    preds = json.loads((ROOT / "data/ai_predictions.json").read_text(encoding="utf-8"))
    latest = history["data"][0]
    return {
        "ok": True,
        "latest_period": latest["period"],
        "latest_date": latest["date"],
        "target_period": preds.get("target_period"),
        "target_date": preds.get("prediction_date"),
        "models": len(preds.get("models", [])),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path.endswith(".json") or self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/status":
            try:
                history = json.loads(
                    (ROOT / "data/lottery_history.json").read_text(encoding="utf-8")
                )
                preds = json.loads(
                    (ROOT / "data/ai_predictions.json").read_text(encoding="utf-8")
                )
                self.send_json(
                    200,
                    {
                        "latest_period": history["data"][0]["period"],
                        "target_period": preds.get("target_period"),
                    },
                )
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/update":
            self.send_error(404)
            return
        try:
            self.send_json(200, update_all())
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"服务已启动: http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
