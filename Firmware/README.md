# Firmware — Cashew Nut Classification System

Firmware cho hai board vi điều khiển trong hệ thống phân loại hạt điều tự động: **Arduino UNO** (điều khiển cơ cấu chấp hành) và **ESP32-CAM** (thu thập ảnh và giao tiếp server).

## Cấu trúc thư mục

```
Firmware/
├── Arduino_UNO/
│   └── ARDUINO.ino          # Điều khiển servo, relay, đọc IR, nút dừng
├── ESP32_CAM/
│   └── ESP32-CAM.ino        # Stream video, chụp ảnh, HTTP POST, nhận kết quả AI
├── docs/
│   ├── hardware_overview.md # Tổng quan phần cứng và BOM
│   ├── wiring_diagram.md    # Sơ đồ kết nối chân chi tiết
│   └── serial_protocol.md   # Giao thức UART giữa Arduino và ESP32-CAM
└── README.md                # File này
```

## Yêu cầu môi trường

### Arduino UNO
- Arduino IDE ≥ 1.8.x hoặc PlatformIO
- Thư viện:
  - `Servo.h` (built-in)
  - `SoftwareSerial.h` (built-in)

### ESP32-CAM (AI Thinker)
- Arduino IDE với ESP32 board package ≥ 2.x
  - Board URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- Chọn board: **AI Thinker ESP32-CAM**
- Thư viện:
  - `esp_camera.h` (có trong ESP32 package)
  - `WiFi.h` (built-in)
  - `HTTPClient.h` (built-in)
  - `esp_http_server.h` (built-in)

## Nạp firmware

### Arduino UNO
1. Mở `Arduino_UNO/ARDUINO.ino` trong Arduino IDE
2. Chọn **Tools → Board → Arduino UNO**
3. Chọn đúng cổng COM
4. Upload

### ESP32-CAM

Có hai cách nạp firmware tùy theo phần cứng bạn đang dùng.

#### Cách A — Dùng đế ESP32-CAM-MB ✅ (khuyến nghị, đang sử dụng)

ESP32-CAM-MB là đế mở rộng tích hợp sẵn chip CP2102 và nút BOOT, cho phép nạp firmware trực tiếp qua Micro-USB mà không cần FTDI hay thao tác kéo chân thủ công.

1. Gắn ESP32-CAM vào đế MB (chú ý chiều — logo ESP32-CAM và MB cùng phía)
2. Cắm cáp Micro-USB từ đế MB vào máy tính
3. Mở `ESP32_CAM/ESP32-CAM.ino`
4. Cấu hình `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_URL` trong file
5. Chọn board **AI Thinker ESP32-CAM**, tốc độ upload **115200**
6. Upload trong Arduino IDE — đế MB tự động xử lý GPIO0
7. Upload xong → nhấn **RESET** một lần để chạy firmware mới

> **Lưu ý**: Khi chạy thực tế (không nạp firmware), có thể tháo ESP32-CAM ra khỏi đế MB và cấp nguồn 5V trực tiếp vào chân 5V/GND của ESP32-CAM để giảm kích thước lắp đặt, hoặc giữ nguyên trên đế nếu không gian cho phép.

#### Cách B — Dùng FTDI adapter (CP2102 hoặc CH340)

Dùng khi không có đế MB hoặc cần debug qua Serial monitor độc lập.

1. Kết nối FTDI với ESP32-CAM: `TX→U0R`, `RX→U0T`, `GND→GND`, `3.3V→3.3V`
2. **Bắt buộc**: kéo dây `GPIO0 → GND` trước khi cấp nguồn để vào chế độ flash
3. Mở `ESP32_CAM/ESP32-CAM.ino`
4. Cấu hình `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_URL` trong file
5. Chọn board **AI Thinker ESP32-CAM**, tốc độ upload **115200**
6. Upload xong → tháo dây `GPIO0 → GND` → nhấn RESET

## Cấu hình nhanh

Các thông số cần chỉnh trong `ESP32-CAM.ino` trước khi nạp:

```cpp
const char* WIFI_SSID     = "TEN_WIFI";
const char* WIFI_PASSWORD = "MAT_KHAU";
const char* SERVER_URL    = "http://192.168.x.x:5000/upload";
```

Các thông số cần chỉnh trong `ARDUINO.ino`:

```cpp
int currentFlashValue = 20;         // Độ sáng flash (20-25 khuyến nghị)
const int SERVO_NEUTRAL = 135;      // Góc nghỉ của servo phân loại
const int SERVO_PUSHED  = 180;      // Góc gạt của servo phân loại
const float CONF_THRESHOLD = 0.80;  // Ngưỡng confidence tối thiểu
```

## Luồng hoạt động tóm tắt

```
Servo phễu (D8) nhả hạt
    → IR (D9) phát hiện hạt
    → Arduino delay 500ms + dừng băng chuyền (Relay D3)
    → Gửi trigger UART → ESP32-CAM
    → ESP32-CAM chụp ảnh + HTTP POST lên server
    → Server YOLOv8 trả về {class, confidence}
    → Nếu confidence < 50% → Servo Gate đóng → reject bin
    → Nếu confidence ≥ 50% → Arduino điều khiển servo theo class
    → Relay ON → băng chuyền tiếp tục
```

Xem chi tiết trong [`docs/hardware_overview.md`](docs/hardware_overview.md) và [`docs/serial_protocol.md`](docs/serial_protocol.md).

## Troubleshooting nhanh

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| ESP32-CAM không kết nối WiFi | Sai SSID/password, router 5GHz | Kiểm tra lại credentials, đảm bảo router 2.4GHz |
| Arduino không nhận lệnh từ ESP32 | Sai chân RX/TX, chưa chung GND | Kiểm tra wiring_diagram.md, đo lại GND |
| Servo không về vị trí neutral | `SERVO_NEUTRAL` không phù hợp servo | Hiệu chỉnh góc neutral cho từng servo |
| Băng chuyền không dừng | Relay mắc ngược NC/NO | Đổi sang chân NO của relay |
| Camera capture thất bại | Flash quá sáng / thiếu sáng | Điều chỉnh `currentFlashValue` (20-25) |