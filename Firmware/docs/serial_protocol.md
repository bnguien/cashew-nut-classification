# Serial Protocol — Arduino ↔ ESP32-CAM

Tài liệu này định nghĩa giao thức giao tiếp UART giữa Arduino UNO và ESP32-CAM. Đây là "hợp đồng" cứng giữa hai firmware — bất kỳ thay đổi nào ở một bên đều phải cập nhật cả hai.

## Thông số vật lý

| Thông số | Giá trị |
|---|---|
| Giao thức | UART (TTL 5V) |
| Baud rate | 9600 |
| Data bits | 8 |
| Stop bits | 1 |
| Parity | None (8N1) |
| Delimiter | `\n` (newline, 0x0A) |
| Thư viện Arduino | `SoftwareSerial` trên D10 (RX) / D11 (TX) |
| Chân ESP32-CAM | GPIO15 (RX) / GPIO14 (TX) — `Serial1` |

## Kết nối chân

```
Arduino UNO          ESP32-CAM
───────────          ─────────
D11 (TX)  ────────► GPIO15 (RX)   
D10 (RX)  ◄──────── GPIO14 (TX)
GND       ───────── GND
```

## Giao thức tin nhắn

### Hướng Arduino → ESP32-CAM

**Mục đích**: Yêu cầu ESP32-CAM chụp ảnh với giá trị flash cụ thể.

**Format**:
```
1-{flashValue}\n
```

**Ví dụ**:
```
1-20\n
1-25\n
```

**Quy tắc**:
- Byte đầu luôn là `'1'` — mã lệnh "trigger chụp ảnh"
- Theo sau là dấu `-` và giá trị flash nguyên (0–255)
- Kết thúc bằng `\n` (newline)
- Flash khuyến nghị: 20–25 (đủ sáng, không overexpose)
- Nếu giá trị flash ngoài khoảng, ESP32-CAM sẽ `constrain` về [0, 255]

**Xử lý ở ESP32-CAM** (`syncWithArduino()`):
```cpp
String cmd = Serial1.readStringUntil('\n');
cmd.trim();
if (cmd[0] == '1') {
    int flashValue = cmd.substring(cmd.indexOf('-') + 1).toInt();
    processCaptureAndPost(constrain(flashValue, 0, 255));
}
```

### Hướng ESP32-CAM → Arduino

**Mục đích**: Trả về kết quả phân loại AI để Arduino đọc được cả class lẫn confidence score, từ đó điều khiển servo phù hợp.

**Format**:
```
{"c":{class},"f":{conf}}\n
```

> Dùng key ngắn `"c"` (class) và `"f"` (confidence) thay vì tên đầy đủ để giảm số byte truyền qua UART — Arduino không có thư viện JSON nặng, parse thủ công sẽ dễ hơn với key ngắn.

**Bảng mã lệnh (`"c"`):**

| `"c"` | Ý nghĩa | `"f"` | Hành động Arduino |
|---|---|---|---|
| `0` | Confidence thấp / nhận diện hạt điều | `< 0.80` | Servo Gate đóng → hạt vào reject bin |
| `1` | Whole — hạt nguyên | `≥ 0.80` | Gate mở, servo 1+2 giữ neutral → khay Whole |
| `2` | Broken — hạt vỡ | `≥ 0.80` | Gate mở, servo 1 gạt → khay Broken |
| `3` | Defect — hạt hỏng | `≥ 0.80` | Gate mở, servo 1+2 đều gạt → khay Defect |

> Khi `"c"` = `0` thì `"f"` vẫn được gửi kèm để Arduino có thể log ra Serial Monitor — hữu ích khi debug xem model đang "gần" nhận ra loại gì (ví dụ `f: 0.43` gần ngưỡng hơn `f: 0.12`).

**Ví dụ**:
```json
{"c":1,"f":0.92}\n    ← Whole, confidence 92%
{"c":2,"f":0.83}\n    ← Broken, confidence 83%
{"c":3,"f":0.80}\n    ← Defect, confidence 80%
{"c":0,"f":0.67}\n    ← Reject, confidence quá thấp
```

**Quy tắc**:
- Luôn có đủ 2 trường `"c"` và `"f"`, kết thúc bằng `\n`
- `"f"` là số thực, 2 chữ số thập phân, trong khoảng `[0.00, 1.00]`
- `"c"` là số nguyên trong `[0, 3]`
- Arduino **không dùng thư viện JSON** — parse thủ công bằng `indexOf` + `substring` để tiết kiệm bộ nhớ SRAM

**Xử lý ở ESP32-CAM** — build chuỗi JSON trước khi gửi:
```cpp
void sendResultToArduino(int classResult, float conf) {
    // Làm tròn conf về 2 chữ số thập phân
    String payload = "{\"c\":" + String(classResult) +
                     ",\"f\":" + String(conf, 2) + "}";
    Serial.printf("→ Arduino: %s\n", payload.c_str());
    Serial1.println(payload);   // println tự thêm \n
}
```

**Xử lý ở Arduino** — parse thủ công, không cần thư viện:
```cpp
if (mySerial.available() > 0) {
    String data = mySerial.readStringUntil('\n');
    data.trim();

    // Parse "c"
    int idxC = data.indexOf("\"c\":") + 4;
    int classResult = data.substring(idxC, data.indexOf(',', idxC)).toInt();

    // Parse "f"
    int idxF = data.indexOf("\"f\":") + 4;
    float conf = data.substring(idxF, data.indexOf('}', idxF)).toFloat();

    Serial.printf("[#%d] class=%d  conf=%.2f\n", ++countClassify, classResult, conf);

    switch (classResult) {
        case 0:
            Serial.println("→ Reject: confidence thấp, Servo Gate đóng");
            // servoGate.write(SERVO_CLOSED);
            break;
        case 1:
            Serial.println("→ Whole: Gate mở, không gạt servo");
            // servoGate.write(SERVO_OPEN);
            break;
        case 2:
            Serial.println("→ Broken: Gate mở, Servo 1 gạt");
            // servoGate.write(SERVO_OPEN);
            // triggerServo(servo1, ...);
            break;
        case 3:
            Serial.println("→ Defect: Gate mở, Servo 1+2 gạt");
            // servoGate.write(SERVO_OPEN);
            // triggerServo(servo1, ...);
            // triggerServo(servo2, ...);
            break;
        default:
            Serial.printf("⚠️ Lệnh không hợp lệ: %s\n", data.c_str());
            break;
    }
}
```

## Timing và timing diagram

```
Arduino                                          ESP32-CAM
   │                                                │
   │── "1-20\n" ──────────────────────────────────► │
   │   (UART, ~1ms ở 9600 baud)                     │
   │                                                │ bật flash (~80ms ổn định)
   │                                                │ chụp ảnh JPEG
   │                                                │ HTTP POST (~200-500ms qua WiFi)
   │                                                │ chờ server response
   │                                                │ nhận JSON từ server
   │◄─────────────────────────────────────────────── {"c":1,"f":0.92}\n
   │
   │ xử lý servo (non-blocking, millis())
   │ relay ON sau 1-2s
```

**Tổng thời gian một chu trình phân loại**: 800ms – 2000ms tùy tốc độ WiFi và server.

**Thời gian băng chuyền dừng**: được Arduino kiểm soát bằng `delay()` hoặc `millis()` sau khi gửi trigger. Khuyến nghị 1500ms để đảm bảo ESP32-CAM luôn nhận đủ response trước khi băng chạy lại.

## Xử lý lỗi

| Tình huống | Hành vi | Ghi chú |
|---|---|---|
| ESP32 timeout không trả lời | Arduino tiếp tục sau 1500ms | Relay ON, băng chạy lại; hạt không phân loại |
| Nhận lệnh lạ (không phải 0-3) | Không kích hoạt servo, log Serial | Arduino ghi `"⚠️ Lệnh không hợp lệ"` |
| Lệnh từ Arduino không rõ | ESP32 log và bỏ qua | ESP32 ghi `"⚠️ Lệnh không rõ từ Arduino"` |
| HTTP POST thất bại | ESP32 log lỗi, không gửi về Arduino | Arduino timeout sau 1500ms |

## Versioning

Nếu sau này cần mở rộng giao thức, quy ước:
- Lệnh từ Arduino → ESP32: byte đầu là mã lệnh (`1` = trigger chụp, có thể thêm `2` = reset, `3` = calibrate...)
- Lệnh từ ESP32 → Arduino: đã dùng JSON `{"c":...,"f":...}` — để thêm trường mới (ví dụ bounding box `"x"`, `"y"`) chỉ cần append vào JSON, Arduino parse thêm trường đó mà không phá vỡ logic cũ