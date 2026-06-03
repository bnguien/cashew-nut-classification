# Troubleshooting — Cashew Nut Classification System

Tài liệu hướng dẫn chẩn đoán và xử lý sự cố theo từng tầng phần cứng. Khi gặp vấn đề, hãy đọc theo thứ tự từ trên xuống — các lỗi tầng dưới thường là nguyên nhân của triệu chứng tầng trên.

---

## Nguyên tắc debug chung

Trước khi tra bảng lỗi, kiểm tra 3 thứ này trước — chúng giải quyết ~70% sự cố:

1. **GND chung**: Tất cả thiết bị (Arduino, ESP32-CAM, servo, IR, relay) phải có GND nối về một điểm. Thiếu GND chung là nguyên nhân phổ biến nhất khiến Serial không hoạt động hoặc tín hiệu nhiễu.
2. **Nguồn servo riêng**: Servo không được lấy điện từ chân 5V của Arduino. Nếu Arduino reset đột ngột khi servo hoạt động → chắc chắn lỗi nguồn.
3. **Baud rate khớp**: Cả hai bên phải cùng `9600`. Sai baud rate khiến dữ liệu nhận được là chuỗi ký tự rác hoàn toàn.

---

## 1. Lỗi nạp firmware

### ESP32-CAM không vào chế độ flash (dùng đế MB)

**Triệu chứng**: Arduino IDE báo `Connecting......_____` rồi timeout, không upload được.

**Nguyên nhân & xử lý**:

| Nguyên nhân | Cách xử lý |
|---|---|
| Sai thứ tự nhấn nút (nếu không xài đế nạp ESP32-CAM-MB) | Đúng thứ tự: giữ BOOT → nhấn RESET → thả RESET → thả BOOT → bấm Upload |
| Chưa chọn đúng cổng COM | Kiểm tra Device Manager (Windows)|
| Cáp USB chỉ có dây nguồn | Đổi sang cáp có dây data (thử cắm vào PC rồi xem có xuất hiện cổng COM không) |
| ESP32-CAM chưa gắn chặt vào đế MB | Tháo ra gắn lại, chú ý chiều (logo cùng phía) |

**Kiểm tra nhanh**: Mở Serial Monitor (115200 baud) → nhấn RESET trên đế MB → phải thấy log boot của ESP32. Nếu không thấy gì → vấn đề là cáp hoặc driver.

---

### ESP32-CAM không vào chế độ flash (dùng FTDI)

**Triệu chứng**: Tương tự trên.

**Nguyên nhân & xử lý**:

| Nguyên nhân | Cách xử lý |
|---|---|
| Chưa kéo GPIO0 → GND trước khi cấp nguồn | Kéo dây trước, sau đó mới cắm nguồn FTDI |
| Cấp nguồn 5V từ FTDI thay vì 3.3V | ESP32-CAM cần 3.3V khi nạp qua FTDI; dùng chân 3.3V của FTDI |
| TX/RX cắm ngược | FTDI TX → ESP32 U0R (không phải U0T); FTDI RX → ESP32 U0T |

---

### Arduino IDE báo lỗi thư viện

**Triệu chứng**: `fatal error: esp_camera.h: No such file or directory`

**Xử lý**: Vào **Tools → Board → Boards Manager** → tìm `esp32` by Espressif → cài phiên bản ≥ 2.x. Sau khi cài xong phải khởi động lại Arduino IDE.

---

## 2. Lỗi giao tiếp Serial Arduino ↔ ESP32-CAM

### Arduino gửi trigger nhưng ESP32-CAM không phản hồi

**Triệu chứng**: Serial Monitor của Arduino in `"📡 Phát hiện hạt → Gửi ESP32: 1-20"` nhưng không thấy log chụp ảnh phía ESP32.

**Checklist**:
```
□ GND của ESP32-CAM và Arduino đã nối chung chưa?
□ Chân D11 (TX Arduino) → GPIO15 (RX ESP32) — đúng chiều chưa?
□ Chân D10 (RX Arduino) ← GPIO14 (TX ESP32) — đúng chiều chưa?
□ Baud rate SoftwareSerial và Serial1 đều là 9600 chưa?
□ ESP32-CAM đã qua màn hình boot WiFi thành công chưa?
   (Phải thấy "✅ WiFi: 192.168.x.x" trong Serial Monitor ESP32)
```

**Cách test độc lập**: Dùng Serial Monitor của ESP32 gõ thủ công `1-20` rồi nhấn Enter → ESP32 phải phản ứng chụp ảnh. Nếu có → vấn đề nằm ở phía Arduino hoặc dây nối.

---

### Arduino nhận được chuỗi rác thay vì JSON

**Triệu chứng**: Serial Monitor Arduino in ra ký tự lạ như `ÿÿ{` hoặc `???`.

**Nguyên nhân**: Baud rate không khớp.

**Xử lý**: Kiểm tra cả hai file:
```cpp
// ARDUINO.ino
SoftwareSerial mySerial(10, 11);
mySerial.begin(9600);   // ← phải là 9600

// ESP32-CAM.ino
Serial1.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);  // ← phải là 9600
```

---

### Arduino parse JSON sai, `classResult` luôn là 0

**Triệu chứng**: Servo không hoạt động đúng, log Serial luôn in `class=0`.

**Nguyên nhân thường gặp**: Chuỗi JSON có khoảng trắng thừa hoặc `\r\n` thay vì chỉ `\n` — `toInt()` trả về 0 khi gặp ký tự không phải số.

**Xử lý**: Đảm bảo `data.trim()` được gọi trước khi parse:
```cpp
String data = mySerial.readStringUntil('\n');
data.trim();  // Xóa \r, \n, khoảng trắng hai đầu — bắt buộc
```

**Kiểm tra nhanh**: In raw data ra Serial trước khi parse:
```cpp
Serial.print("RAW: [");
Serial.print(data);
Serial.println("]");
```
Nếu thấy `RAW: [{"c":1,"f":0.92}]` → parse đúng.
Nếu thấy `RAW: [{"c":1,"f":0.92}\r]` → thêm `data.trim()`.

---

## 3. Lỗi kết nối WiFi và HTTP

### ESP32-CAM không kết nối được WiFi

**Triệu chứng**: Serial Monitor in dấu chấm liên tục `Đang kết nối WiFi..........` không dừng.

| Nguyên nhân | Cách xử lý |
|---|---|
| Sai SSID hoặc password | Kiểm tra lại, chú ý phân biệt hoa thường |
| Router phát WiFi 5GHz | ESP32-CAM chỉ hỗ trợ 2.4GHz; bật băng tần 2.4GHz trên router |
| ESP32-CAM ở quá xa router | Đặt gần router khi test lần đầu |
| SSID có ký tự đặc biệt | Thử đổi tên WiFi sang ASCII thuần, không dấu |
| Nguồn không ổn định | WiFi module tiêu thụ điện cao lúc kết nối; đảm bảo nguồn ≥ 500mA |

---

### HTTP POST thất bại — lỗi `-1` hoặc timeout

**Triệu chứng**: ESP32 in `❌ HTTP Error: connection refused` hoặc `connection timeout`.

**Checklist**:
```
□ SERVER_URL có đúng IP của máy chạy server không?
  (Chạy `ipconfig` trên Windows hoặc `ifconfig` trên macOS để kiểm tra)
□ ESP32-CAM và server có cùng mạng WiFi không?
□ Server Flask/Django đang chạy chưa? (thử truy cập từ trình duyệt)
□ Firewall của máy tính có chặn cổng 5000 không?
  Windows: tắt thử Windows Defender Firewall
□ HTTP_TIMEOUT_MS đủ lớn chưa? (khuyến nghị ≥ 6000ms)
```

**Kiểm tra nhanh**: Từ thiết bị khác cùng mạng, dùng trình duyệt truy cập `http://{SERVER_IP}:5000/upload` — nếu server trả về `405 Method Not Allowed` là server đang chạy đúng (endpoint chỉ nhận POST).

---

### Server trả về HTTP 400 hoặc 500

**Triệu chứng**: ESP32 in `⚠️ Server trả về HTTP 400`.

| Code | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| 400 | Content-Type sai hoặc body rỗng | Kiểm tra `http.addHeader("Content-Type", "image/jpeg")` |
| 413 | Ảnh quá lớn, server từ chối | Đổi `FRAMESIZE_SVGA` → `FRAMESIZE_VGA` trong `initCamera()` |
| 500 | Lỗi server phía AI | Xem log server; thường do model chưa load hoặc thiếu dependency |

---

## 4. Lỗi camera và ảnh

### Camera init thất bại

**Triệu chứng**: Serial Monitor in `❌ Camera init failed!` ngay khi boot.

| Nguyên nhân | Cách xử lý |
|---|---|
| ESP32-CAM chưa gắn camera ribbon | Kiểm tra dây cáp mỏng nối camera vào board, gài chắc chắn |
| Cấp nguồn không đủ | Dùng nguồn 5V/1A riêng cho ESP32-CAM, không lấy từ 3.3V FTDI |
| Board bị lỗi | Thử với ESP32-CAM khác nếu có |

---

### Ảnh chụp bị tối hoặc trắng xóa

**Triệu chứng**: AI trả về confidence thấp liên tục, ảnh stream trên `:81/stream` bị tối hoặc overexpose.

| Triệu chứng cụ thể | Nguyên nhân | Xử lý |
|---|---|---|
| Ảnh tối | `currentFlashValue` quá thấp hoặc flash LED hỏng | Tăng `currentFlashValue` lên 30-50; kiểm tra GPIO4 |
| Ảnh trắng xóa | Flash quá sáng, hạt quá gần camera | Giảm `currentFlashValue` xuống 15-20; tăng khoảng cách camera-hạt |
| Ảnh mờ nhòe | Hạt đang di chuyển khi chụp | Tăng delay sau khi relay OFF; kiểm tra băng chuyền đã dừng hẳn chưa |
| Ảnh chụp trúng background | Hạt chưa vào đúng vùng chụp | Tăng delay 500ms → 700-800ms sau khi IR kích hoạt |

**Cách test flash**: Mở Serial Monitor của Arduino, gõ `s` → Arduino gửi lệnh chụp thủ công; xem ảnh trên stream `:81/stream` để đánh giá chất lượng mà không cần chạy cả hệ thống.

---

### AI liên tục trả về confidence thấp (`"c":0`)

**Triệu chứng**: Hầu hết hạt đều bị reject dù hạt bình thường.

**Checklist theo thứ tự**:
```
1. Mở stream :81/stream → kiểm tra ảnh thực tế
2. Nếu ảnh tối/mờ → xem mục "Ảnh chụp bị tối" ở trên
3. Nếu ảnh rõ nhưng AI vẫn fail → có thể hạt nằm lệch vùng chụp
   → Điều chỉnh vị trí IR sensor hoặc tăng delay
4. Nếu ảnh chụp đúng hạt → liên hệ team AI kiểm tra model
   → Gửi kèm ảnh mẫu gây lỗi để team AI phân tích
```

---

## 5. Lỗi servo và cơ cấu chấp hành

### Servo giật mạnh hoặc Arduino reset khi servo hoạt động

**Triệu chứng**: Arduino khởi động lại đột ngột khi 2+ servo hoạt động cùng lúc.

**Nguyên nhân**: Servo lấy điện từ chân 5V Arduino — không đủ dòng.

**Xử lý**: Dùng nguồn 5V/2A ngoài cho tất cả servo, chỉ nối chung GND với Arduino. Không nối VCC servo vào chân 5V của Arduino.

---

### Servo không về vị trí neutral sau khi gạt

**Triệu chứng**: Servo gạt xong nhưng không trở về góc 135°, gây kẹt hạt lần sau.

**Nguyên nhân**: Giá trị `SERVO_NEUTRAL` không khớp với servo thực tế (mỗi servo SG90 có sai số cơ học khác nhau).

**Xử lý**: Hiệu chỉnh từng servo:
```cpp
// Test nhanh trong setup() để tìm góc neutral đúng
servo1.write(135);  // Thay đổi giá trị này từ 90→180 để tìm vị trí thực sự neutral
delay(2000);
```
Ghi lại góc neutral của từng servo và cập nhật vào hằng số tương ứng trong code.

---

### Servo Gate không mở dù confidence đủ

**Triệu chứng**: Log Arduino in đúng class và conf, nhưng servo gate không nhúc nhích.

**Checklist**:
```
□ servoGate đã được attach() đúng chân D5 chưa?
□ Logic điều kiện conf >= CONF_THRESHOLD đúng không?
  (Kiểm tra CONF_THRESHOLD có đang là 0.50 không)
□ Nguồn servo gate có được cấp từ nguồn ngoài không?
□ Dây tín hiệu D5 có tiếp xúc tốt không? (thử dùng jumper khác)
```

---

### Băng chuyền không dừng khi chụp ảnh

**Triệu chứng**: Băng chuyền vẫn chạy, ảnh chụp bị nhòe hoặc mất hạt.

| Nguyên nhân | Cách xử lý |
|---|---|
| Relay mắc vào NC thay vì NO | Đổi dây tải sang chân NO của relay module |
| Chân IN của relay không nhận tín hiệu | Đo điện áp chân D3: phải xuống ~0V khi relay kích hoạt |
| Relay bị hỏng | Thử relay khác; nghe tiếng "click" khi D3 chuyển mức |

---

## 6. Lỗi cảm biến IR

### IR kích hoạt liên tục hoặc không kích hoạt

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Kích hoạt liên tục dù không có hạt | Khoảng cách phát hiện chỉnh quá xa, phản xạ từ băng chuyền | Vặn biến trở trên FC-51 để thu hẹp vùng phát hiện |
| Không kích hoạt dù có hạt | Hạt màu tối hấp thụ IR, khoảng cách quá xa | Giảm khoảng cách cảm biến-hạt; thử FC-51 có LED đỏ kiểm tra |
| Kích hoạt đôi lần cho một hạt | Rung băng chuyền gây debounce fail | Tăng `TRIGGER_DEBOUNCE_MS` từ 1200 → 1500ms |

**Kiểm tra nhanh**: Mở Serial Monitor, che tay trước cảm biến → phải thấy log `"📡 Phát hiện hạt"`. Không thấy → kiểm tra kết nối VCC/GND/DATA và giá trị `INPUT_PULLUP` trên D9.

---

## 7. Quy trình debug hệ thống toàn diện

Khi không xác định được tầng lỗi, chạy theo quy trình sau:

```
Bước 1 — Test ESP32-CAM độc lập
   Mở Serial Monitor ESP32 (115200 baud)
   Gõ thủ công: 1-20
   Kỳ vọng: thấy log chụp ảnh + HTTP POST + kết quả AI
   → Nếu fail: vấn đề ở ESP32/WiFi/Server
   → Nếu OK: tiếp tục bước 2

Bước 2 — Test Arduino → ESP32 (Serial)
   Mở Serial Monitor Arduino (9600 baud)
   Gõ: s  (lệnh chụp thủ công)
   Kỳ vọng: Arduino gửi "1-20", ESP32 nhận và xử lý
   → Nếu fail: vấn đề ở dây Serial hoặc GND chung
   → Nếu OK: tiếp tục bước 3

Bước 3 — Test IR → trigger
   Để tay che IR sensor
   Kỳ vọng: Arduino log "📡 Phát hiện hạt", delay 500ms, gửi ESP32
   → Nếu fail: vấn đề ở IR sensor hoặc debounce
   → Nếu OK: tiếp tục bước 4

Bước 4 — Test servo từng cái
   Trong Serial Monitor Arduino, gõ từng class: 1, 2, 3
   (nếu đã implement lệnh test thủ công)
   Kỳ vọng: servo tương ứng gạt rồi về neutral
   → Nếu fail: vấn đề ở nguồn servo hoặc hiệu chỉnh góc

Bước 5 — Chạy toàn hệ thống với hạt thật
   Thả một hạt vào phễu, quan sát toàn bộ luồng
   So sánh với kết quả trên stream :81/stream
```

---

## 8. Thông điệp log tham khảo

Bảng các thông điệp log quan trọng trong firmware để đối chiếu khi debug:

| Log | Nguồn | Ý nghĩa |
|---|---|---|
| `✅ WiFi: 192.168.x.x` | ESP32 | Kết nối WiFi thành công |
| `🎥 Stream: http://...` | ESP32 | HTTP stream server đang chạy |
| `💡 Flash: 20` | ESP32 | Flash được bật với giá trị 20 |
| `✅ AI Result: {"c":1,"f":0.92}` | ESP32 | Nhận kết quả AI thành công |
| `❌ HTTP Error: ...` | ESP32 | POST ảnh thất bại |
| `⚠️ Stream: camera capture failed` | ESP32 | Camera không chụp được frame |
| `📡 Phát hiện hạt → Gửi ESP32: 1-20` | Arduino | IR kích hoạt, gửi lệnh trigger |
| `[#5] class=2  conf=0.78` | Arduino | Nhận kết quả lần thứ 5 |
| `⚠️ Lệnh không hợp lệ: ...` | Arduino | Nhận được dữ liệu không parse được |