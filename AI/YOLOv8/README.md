# YOLOv8 + ESP32-CAM (Python)

Dự án này nhận ảnh từ ESP32-CAM qua HTTP và chạy nhận diện vật thể bằng YOLOv8.

## 1) Chuẩn bị

- Python 3.9+ (khuyến nghị dùng virtual environment)
- File model đã train: `best.pt` (đặt cùng thư mục với `esp32_yolo.py`)
- ESP32-CAM đang chạy và truy cập được endpoint ảnh:
  - `http://<IP_ESP32>/capture`

## 2) Cài thư viện

Trong thư mục project, chạy:

```powershell
python -m pip install opencv-python requests ultralytics
```

Nếu bạn dùng venv như hiện tại:

```powershell
.\.venv\Scripts\python.exe -m pip install opencv-python requests ultralytics
```

## 3) Cấu hình IP ESP32

Mở file `esp32_yolo.py` và sửa dòng URL:

```python
url = "http://<IP của ESP32>/capture"
```

Ví dụ:

```python
url = "http://192.168.1.105/capture"
```

## 4) Chạy chương trình

```powershell
.\.venv\Scripts\python.exe esp32_yolo.py
```

- Cửa sổ `ESP32 YOLO Detection` sẽ hiển thị ảnh có bounding box.
- Nhấn `ESC` để thoát.

## 5) Lỗi thường gặp

- Không hiện ảnh / treo khi chạy:
  - Kiểm tra ESP32 và máy tính cùng mạng Wi-Fi.
  - Mở thử URL `http://<IP_ESP32>/capture` trên trình duyệt.
- Lỗi không tìm thấy model:
  - Đảm bảo `best.pt` nằm đúng thư mục gốc dự án.
- Lỗi module thiếu (`cv2`, `requests`, `ultralytics`):
  - Cài lại thư viện bằng đúng Python/venv đang dùng.

## Cấu trúc thư mục

```text
YOLOv8/
├─ best.pt
├─ esp32_yolo.py
└─ README.md
```
