from flask import Flask, request, Response
import cv2
import numpy as np
import os
import time
import random
import requests

app = Flask(__name__)

# =============================================================================
# CẤU HÌNH
# =============================================================================
ESP32_IP    = "172.20.10.5"   # << Thay bằng IP thực của ESP32-CAM
BASE_PATH   = "dataset_cashew"
CURRENT_MODE = "val"           # "train" | "val" | "test"
DISPLAY_GUI = False            # Đặt True nếu máy chủ có màn hình (không phải headless)

LABEL_MAP = {"1": "whole", "2": "broken", "3": "defect"}

# =============================================================================
# KHỞI TẠO THƯ MỤC
# =============================================================================
def create_structure():
    date_str = time.strftime("%Y%m%d")
    for label in LABEL_MAP.values():
        path = os.path.join(BASE_PATH, date_str, CURRENT_MODE, label)
        os.makedirs(path, exist_ok=True)
        print(f"📁 Ready: {path}")

create_structure()

# =============================================================================
# STREAM PROXY  (/video_feed)
# Chuyển tiếp MJPEG stream từ ESP32-CAM sang client qua server
# =============================================================================
@app.route("/video_feed")
def video_feed():
    def generate():
        try:
            stream_url = f"http://{ESP32_IP}:81/stream"
            response = requests.get(stream_url, stream=True, timeout=5)
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=1024):
                yield chunk
        except requests.exceptions.ConnectionError:
            print(f"❌ Stream: Không kết nối được ESP32 tại {ESP32_IP}")
        except requests.exceptions.Timeout:
            print("❌ Stream: ESP32 timeout")
        except Exception as e:
            print(f"❌ Stream lỗi: {e}")

    return Response(
        generate(),
        mimetype="multipart/x-mixed-replace; boundary=123456789000000000000987654321"
    )

# =============================================================================
# NHẬN ẢNH + GIẢ LẬP AI  (/upload)
# Nhận ảnh JPEG từ ESP32, lưu đúng thư mục theo kết quả AI, trả về nhãn
# =============================================================================
@app.route("/upload", methods=["POST"])
def upload_file():
    try:
        # Decode ảnh
        file_bytes = np.frombuffer(request.data, np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
            print("❌ Upload: Không decode được ảnh")
            return "FAILED_DECODE", 400

        # --- Giả lập AI (random 1-3) ---
        ai_result = random.choice(["1", "2", "3"])
        target_label = LABEL_MAP[ai_result]   # FIX: lưu đúng thư mục theo kết quả

        # Lưu ảnh
        timestamp    = int(time.time() * 1000)
        date_folder  = time.strftime("%Y%m%d")
        save_path    = os.path.join(BASE_PATH, date_folder, CURRENT_MODE, target_label, f"cap_{timestamp}.jpg")
        cv2.imwrite(save_path, img)

        print(f"📸 Saved → {save_path} | 🤖 AI Result: {ai_result} ({target_label})")

        # Hiển thị GUI chỉ khi bật và có màn hình  — FIX: không crash server headless
        if DISPLAY_GUI:
            try:
                display_img = cv2.resize(img, (400, 300))
                cv2.putText(display_img, f"Result: {ai_result} - {target_label}",
                            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                cv2.imshow("SERVER OBSERVATION", display_img)
                cv2.waitKey(1)
            except Exception as e:
                print(f"⚠️ GUI error (tắt DISPLAY_GUI nếu headless): {e}")

        return ai_result, 200

    except Exception as e:
        print(f"❌ Upload lỗi: {e}")
        return "ERROR", 500

# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    print("=" * 50)
    print("🚀 Server AI giả lập (Cashew Classifier)")
    print(f"📍 Upload endpoint : http://<SERVER_IP>:5000/upload")
    print(f"🎥 Stream proxy    : http://<SERVER_IP>:5000/video_feed")
    print(f"💾 Dataset path    : {BASE_PATH}/")
    print(f"🖥️  GUI display     : {'ON' if DISPLAY_GUI else 'OFF (headless mode)'}")
    print("=" * 50)

    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)