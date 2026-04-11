# Hướng dẫn chạy hệ thống phân loại hạt điều IoT

## Tổng quan hệ thống

```
[IR Sensor] → [Arduino] →(Serial)→ [ESP32-CAM] →(HTTP POST)→ [Server Python]
                 ↑                       ↑                          |
             [Servo x2]         [MJPEG Stream :81]          [Lưu ảnh + AI]
                 ↑                                                  |
                 └──────────────(Serial)────────────────────────────┘
```

---

## BƯỚC 1 — Chuẩn bị môi trường

### 1.1 Cài thư viện Arduino IDE
Mở Arduino IDE → Tools → Manage Libraries → cài:
- `Servo` (built-in)
- `SoftwareSerial` (built-in)

### 1.2 Cài board ESP32 vào Arduino IDE
Vào File → Preferences → Additional Board Manager URLs, thêm:
```
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
```
Sau đó Tools → Board → Boards Manager → tìm `esp32` → Install

Board cần chọn: **AI Thinker ESP32-CAM**

### 1.3 Cài Python dependencies cho server
```bash
pip install flask opencv-python numpy requests
```

---

## BƯỚC 2 — Cấu hình IP (quan trọng)

Tất cả thiết bị phải cùng một mạng WiFi (LAN).

### 2.1 Tìm IP của máy chạy server
```bash
# Windows
ipconfig

# Linux / macOS
ip addr show   # hoặc: ifconfig
```
Ghi lại IP, ví dụ: `192.168.1.15`

### 2.2 Cập nhật IP vào code
**Trong `server.py`:**
```python
ESP32_IP = "192.168.1.xxx"   # IP của ESP32-CAM (xem ở Serial Monitor sau khi nạp)
```

**Trong `ESP32-CAM.ino`:**
```cpp
const char* SERVER_URL = "http://192.168.1.xxx:5000/upload"; // IP máy chạy server
const char* WIFI_SSID     = "TEN_WIFI";
const char* WIFI_PASSWORD = "MAT_KHAU_WIFI";
```

---

## BƯỚC 3 — Nạp code Arduino

1. Cắm Arduino vào máy tính qua USB
2. Mở `ARDUINO.ino` trong Arduino IDE
3. Chọn: Tools → Board → **Arduino Uno** (hoặc board đang dùng)
4. Chọn đúng COM port: Tools → Port → `COMx` (Windows) hoặc `/dev/ttyUSBx` (Linux)
5. Nhấn **Upload** (mũi tên →)
6. Sau khi upload xong, mở Serial Monitor (Ctrl+Shift+M), chọn baud **9600**
7. Kiểm tra thấy:
   ```
   ----- CASHEW CLASSIFIER - ARDUINO -----
   Sẵn sàng! Gõ số (0-255) để thay đổi flash.
   ```

---

## BƯỚC 4 — Nạp code ESP32-CAM

> ESP32-CAM không có cổng USB trực tiếp, cần dùng **FTDI adapter** hoặc **Arduino làm bridge**.

### Dùng FTDI adapter (khuyến nghị):
| FTDI     | ESP32-CAM |
|----------|-----------|
| GND      | GND       |
| 3.3V/5V  | 5V        |
| TX       | U0R (RX)  |
| RX       | U0T (TX)  |

**Bắt buộc:** Cắm dây nối **GPIO0 → GND** để vào chế độ flash trước khi nạp, tháo ra sau khi nạp xong.

### Cài đặt trong Arduino IDE:
- Board: `AI Thinker ESP32-CAM`
- Upload Speed: `115200`
- Port: chọn port của FTDI

### Upload và kiểm tra:
1. Nhấn Upload
2. Sau khi thấy `Connecting...`, nhấn nút **RESET** trên ESP32-CAM
3. Sau khi upload xong, tháo dây **GPIO0 → GND**, nhấn RESET lại
4. Mở Serial Monitor baud **115200**, kiểm tra thấy:
   ```
   ===== ESP32-CAM CASHEW CLASSIFIER =====
   ✅ Camera OK
   ✅ WiFi: 192.168.1.xxx        ← ghi lại IP này
   📡 Upload: http://192.168.1.15:5000/upload
   🎥 Stream: http://192.168.1.xxx:81/stream
   ========================================
   ```
5. Cập nhật IP ESP32 vừa thấy vào `server.py` → `ESP32_IP`

---

## BƯỚC 5 — Khởi động Server Python

```bash
cd /đường/dẫn/tới/thư/mục
python server.py
```

Thấy output:
```
==================================================
🚀 Server AI giả lập (Cashew Classifier)
📍 Upload endpoint : http://<SERVER_IP>:5000/upload
🎥 Stream proxy    : http://<SERVER_IP>:5000/video_feed
💾 Dataset path    : dataset_cashew/
🖥️  GUI display     : OFF (headless mode)
==================================================
```

---

## BƯỚC 6 — Kiểm tra toàn luồng

### 6.1 Test stream video
Mở trình duyệt, truy cập:
```
http://<IP_ESP32>:81/stream          ← Trực tiếp từ ESP32
http://<IP_SERVER>:5000/video_feed   ← Qua proxy server
```
Thấy hình ảnh camera live → OK.

### 6.2 Test gửi ảnh thủ công (không cần IR)
Dùng curl để giả lập Arduino gửi ảnh:
```bash
curl -X POST http://<IP_SERVER>:5000/upload \
     -H "Content-Type: image/jpeg" \
     --data-binary @test_image.jpg
```
Server trả về `1`, `2`, hoặc `3` → OK.

### 6.3 Test toàn luồng thật
1. Đưa vật thể qua IR sensor (pin 9 của Arduino)
2. Quan sát **Serial Monitor Arduino**:
   ```
   📡 Phát hiện hạt → Gửi ESP32: 1-20
   ```
3. Quan sát **Serial Monitor ESP32-CAM**:
   ```
   --- Capture #1 (flash=20) ---
   💡 Flash: 20
   ✅ AI Result: 2
   1. → Arduino: "2"
   ```
4. Quan sát lại **Serial Monitor Arduino**:
   ```
   [#1] AI kết quả: 2 → Hạt Vỡ (Broken): Servo 2 gạt
   ```
5. Servo 2 gạt → về vị trí neutral sau 1 giây
6. Ảnh được lưu tại: `dataset_cashew/YYYYMMDD/val/broken/cap_xxxxx.jpg`

---

## Điều chỉnh flash từ Serial Monitor

Trong lúc hệ thống chạy, mở Serial Monitor của Arduino (baud 9600), gõ số rồi Enter:
```
50       ← Flash sáng hơn
0        ← Tắt flash
255      ← Flash tối đa
```
Giá trị được gửi kèm lệnh chụp tiếp theo.

---

## Thay đổi mode lưu dataset

Trong `server.py`, sửa dòng:
```python
CURRENT_MODE = "val"   # Đổi thành "train" hoặc "test"
```
Khởi động lại server để có hiệu lực.

---

## Bật GUI quan sát (nếu máy có màn hình)

Trong `server.py`, sửa:
```python
DISPLAY_GUI = True
```
Cửa sổ `SERVER OBSERVATION` hiện ảnh sau mỗi lần nhận.

---

## Sơ đồ nối dây tham khảo

```
Arduino UNO          ESP32-CAM
-----------          ---------
GND       ←→        GND
Pin 10 (RX) ←←←←←  GPIO14 (TX)
Pin 11 (TX) →→→→→  GPIO15 (RX)

Arduino UNO          Servo 1     Servo 2
-----------          -------     -------
Pin 6       →        Signal
Pin 7       →                    Signal
5V          →        VCC         VCC
GND         →        GND         GND

Arduino UNO          IR Sensor
-----------          ---------
Pin 9       ←        OUT
5V          →        VCC
GND         →        GND
```

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|------------|
| ESP32 không kết nối WiFi | Sai SSID/password | Kiểm tra lại trong code |
| `❌ HTTP Error` | Server chưa chạy hoặc sai IP | Chạy server trước, kiểm tra IP |
| Servo không gạt | Sai baud Serial hoặc dây nối | Kiểm tra TX/RX không bị đảo |
| Ảnh lưu hết vào `whole/` | Dùng code cũ chưa fix | Dùng `server.py` đã cập nhật |
| Stream proxy timeout | ESP32 mất điện hoặc offline | Kiểm tra nguồn ESP32 |
| `FAILED_DECODE` | Ảnh JPEG hỏng | Giảm `jpeg_quality` hoặc kiểm tra dây GND |
