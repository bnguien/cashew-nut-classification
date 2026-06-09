from flask import Flask, request, Response, jsonify, redirect
import cv2
import numpy as np
import os
import time
import random
import requests

app = Flask(__name__)

ESP32_IP     = "172.20.10.5"
BASE_PATH    = "dataset_cashew"
DISPLAY_GUI  = False
LABEL_MAP    = {"1": "whole", "2": "broken", "3": "defect"}

state = {
    "manual_label": None,
    "mode": "val",
    "count": {"1": 0, "2": 0, "3": 0},
    "last_result": None,
}

def create_structure(mode=None):
    if mode is None: mode = state["mode"]
    date_str = time.strftime("%Y%m%d")
    for label in LABEL_MAP.values():
        os.makedirs(os.path.join(BASE_PATH, date_str, mode, label), exist_ok=True)
    print(f"📁 Ready: {BASE_PATH}/{date_str}/{mode}/")

create_structure()

@app.route("/")
def index():
    ml = state["manual_label"]
    mode = state["mode"]
    counts = state["count"]
    last = state["last_result"] or "—"
    label_status = f"<b style='color:#f90'>MANUAL: {LABEL_MAP.get(ml,ml)}</b>" if ml else "<b style='color:#0f9'>AI MODE (random)</b>"
    html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cashew Classifier</title>
<style>
body{{font-family:monospace;background:#1a1a1a;color:#eee;padding:20px;max-width:620px;margin:auto}}
h2{{color:#fff;border-bottom:1px solid #444;padding-bottom:8px}}
.card{{background:#2a2a2a;border-radius:8px;padding:16px;margin:12px 0}}
.btn{{display:inline-block;padding:10px 20px;border-radius:6px;border:none;font-size:15px;font-weight:bold;cursor:pointer;margin:4px;text-decoration:none}}
.w{{background:#2a7d4f;color:#fff}}.b{{background:#7d6e2a;color:#fff}}.d{{background:#7d2a2a;color:#fff}}
.ai{{background:#2a4a7d;color:#fff}}.sm{{background:#444;color:#eee;font-size:13px}}
.active{{outline:3px solid #fff}}
.stat{{display:flex;gap:16px;flex-wrap:wrap}}
.si{{background:#333;padding:10px 16px;border-radius:6px;text-align:center}}
.sn{{font-size:24px;font-weight:bold;color:#fff}}.sl{{font-size:12px;color:#aaa}}
</style></head><body>
<h2>&#127802; Cashew Classifier</h2>
<div class="card">
  <div style="margin-bottom:10px">Chế độ lưu: {label_status}</div>
  <a href="/set_label/1" class="btn w {'active' if ml=='1' else ''}">Whole (1)</a>
  <a href="/set_label/2" class="btn b {'active' if ml=='2' else ''}">Broken (2)</a>
  <a href="/set_label/3" class="btn d {'active' if ml=='3' else ''}">Defect (3)</a>
  <a href="/set_label/auto" class="btn ai {'active' if ml is None else ''}">AI Auto</a>
</div>
<div class="card">
  <span style="font-size:13px;color:#aaa">Dataset mode: </span>
  <a href="/set_mode/train" class="btn sm {'active' if mode=='train' else ''}">train</a>
  <a href="/set_mode/val"   class="btn sm {'active' if mode=='val' else ''}">val</a>
  <a href="/set_mode/test"  class="btn sm {'active' if mode=='test' else ''}">test</a>
  <div style="font-size:12px;color:#777;margin-top:8px">Lưu vào: <code>{BASE_PATH}/{time.strftime('%Y%m%d')}/{mode}/</code></div>
</div>
<div class="card">
  <div style="margin-bottom:10px;font-size:13px;color:#aaa">Thống kê ({time.strftime('%Y%m%d')})</div>
  <div class="stat">
    <div class="si"><div class="sn" style="color:#2ecc71">{counts['1']}</div><div class="sl">Whole</div></div>
    <div class="si"><div class="sn" style="color:#f39c12">{counts['2']}</div><div class="sl">Broken</div></div>
    <div class="si"><div class="sn" style="color:#e74c3c">{counts['3']}</div><div class="sl">Defect</div></div>
    <div class="si"><div class="sn">{sum(counts.values())}</div><div class="sl">Total</div></div>
  </div>
</div>
<div class="card">
  <div style="background:#111;padding:10px;border-radius:6px;font-size:13px">Kết quả cuối: <b>{last}</b></div>
  <div style="margin-top:10px">
    <a href="/video_feed" target="_blank" class="btn sm">&#127909; Stream</a>
    <a href="/" class="btn sm">&#8635; Refresh</a>
    <a href="/status" target="_blank" class="btn sm">&#128202; Status API</a>
  </div>
</div>
</body></html>"""
    return html

@app.route("/set_label/<label>")
def set_label(label):
    if label == "auto":
        state["manual_label"] = None
        print("🤖 → AI mode")
    elif label in LABEL_MAP:
        state["manual_label"] = label
        print(f"🏷️  → Manual: {LABEL_MAP[label]}")
    else:
        return jsonify({"error": "label phải là 1,2,3 hoặc auto"}), 400
    return redirect("/")

@app.route("/set_mode/<mode>")
def set_mode(mode):
    if mode not in ("train", "val", "test"):
        return jsonify({"error": "mode phải là train/val/test"}), 400
    state["mode"] = mode
    create_structure(mode)
    print(f"📂 Mode → {mode}")
    return redirect("/")

@app.route("/video_feed")
def video_feed():
    def generate():
        try:
            r = requests.get(f"http://{ESP32_IP}:81/stream", stream=True, timeout=5)
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=1024):
                yield chunk
        except requests.exceptions.ConnectionError:
            print(f"❌ Stream: không kết nối ESP32 {ESP32_IP}")
        except requests.exceptions.Timeout:
            print("❌ Stream timeout")
        except Exception as e:
            print(f"❌ Stream: {e}")
    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=123456789000000000000987654321")

@app.route("/upload", methods=["POST"])
def upload_file():
    try:
        img = cv2.imdecode(np.frombuffer(request.data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            print("❌ Decode thất bại")
            return "FAILED_DECODE", 400

        if state["manual_label"] is not None:
            ai_result = state["manual_label"]
            mode_str  = "MANUAL"
        else:
            ai_result = random.choice(["1", "2", "3"])
            mode_str  = "AI"

        target_label = LABEL_MAP[ai_result]
        state["count"][ai_result] += 1
        state["last_result"] = f"{ai_result} ({target_label}) [{mode_str}]"

        ts = int(time.time() * 1000)
        save_path = os.path.join(BASE_PATH, time.strftime("%Y%m%d"), state["mode"], target_label, f"cap_{ts}.jpg")
        cv2.imwrite(save_path, img)
        print(f"📸 [{mode_str}] → {save_path}")

        if DISPLAY_GUI:
            try:
                d = cv2.resize(img, (400, 300))
                cv2.putText(d, f"[{mode_str}] {ai_result}:{target_label}", (10,30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,255,0), 2)
                cv2.imshow("SERVER", d); cv2.waitKey(1)
            except: pass

        return ai_result, 200
    except Exception as e:
        print(f"❌ Upload: {e}")
        return "ERROR", 500

@app.route("/status")
def status():
    return jsonify({
        "manual_label": state["manual_label"],
        "label_name": LABEL_MAP.get(state["manual_label"]) if state["manual_label"] else "auto",
        "mode": state["mode"],
        "count": state["count"],
        "last_result": state["last_result"],
        "stream_url": f"http://{ESP32_IP}:81/stream",
    })

if __name__ == "__main__":
    print("=" * 55)
    print("🚀 Cashew Classifier Server")
    print(f"🌐 Web UI    : http://<SERVER_IP>:5000")
    print(f"📍 Upload    : http://<SERVER_IP>:5000/upload")
    print(f"🎥 Stream    : http://<SERVER_IP>:5000/video_feed")
    print(f"📊 Status    : http://<SERVER_IP>:5000/status")
    print("=" * 55)
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)