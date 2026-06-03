# Hardware Overview — Cashew Nut Classification System

## Tổng quan kiến trúc phần cứng

Hệ thống gồm 3 tầng phần cứng phối hợp với nhau:

```
┌─────────────────────────────────────────────────────────┐
│  Tầng cảm biến & chấp hành  (Arduino UNO)               │
│  IR sensor · Servo x4 · Relay · Nút dừng khẩn           │
└────────────────────────┬────────────────────────────────┘
                         │ UART Serial (9600 baud)
┌────────────────────────▼────────────────────────────────┐
│  Tầng thu thập ảnh  (ESP32-CAM AI Thinker)              │
│  OV3660 camera · Flash LED · WiFi 2.4GHz                │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / WiFi
┌────────────────────────▼────────────────────────────────┐
│  Tầng AI  (Server PC / Cloud)                           │
│  Django · YOLOv8 · REST API                             │
└─────────────────────────────────────────────────────────┘
```

## Danh sách linh kiện (BOM)

| # | Linh kiện | Model / Thông số | Số lượng | Ghi chú |
|---|---|---|---|---|
| 1 | Vi điều khiển | Arduino UNO R3 | 1 | Điều khiển cơ cấu |
| 2 | Camera module | ESP32-CAM AI Thinker (OV3660) | 1 | WiFi + camera |
| 3 | Servo phân loại | SG90 hoặc MG90S | 2 | Servo 1 (D6), Servo 2 (D7) |
| 4 | Servo gate | SG90 hoặc MG90S | 1 | Chặn luồng khi confidence thấp hoặc nhận diện thành background(D5) |
| 5 | Servo phễu | SG90 hoặc MG90S | 1 | Nhả từng hạt theo chu kì (D8) |
| 6 | Cảm biến IR | FC-51 hoặc E18-D80NK | 1 | Phát hiện hạt (D9) |
| 7 | Relay module | 5V 1-channel opto-isolated | 1 | Điều khiển băng chuyền (D3) |
| 8 | Nút nhấn | Tactile button, NO | 1 | Dừng khẩn, kết nối D2 (INT0) |
| 9 | Nguồn servo | 5V / 2A trở lên | 1 | Cấp riêng, không dùng chân 5V Ard |
| 10 | FTDI adapter | CP2102 hoặc CH340 | 1 | Nạp firmware ESP32-CAM |
| 11 | Dây nối | Jumper wire M-M, M-F | nhiều | |

> **Lưu ý nguồn điện**: Servo tiêu thụ dòng cao khi khởi động (200-600mA mỗi servo). Không cấp 4 servo cùng lúc từ chân 5V của Arduino — dùng nguồn 5V/2A ngoài, chỉ nối chung GND với Arduino.

## Mô tả vai trò từng thiết bị

### Arduino UNO — Bộ điều khiển thiêt bị & động cơ

Arduino đóng vai trò trung tâm điều khiển tất cả cơ cấu chấp hành. Nó không tham gia xử lý AI hay kết nối mạng, chỉ làm một việc: nhận tín hiệu → kích hoạt đúng cơ cấu đúng thời điểm.

**Nhiệm vụ cụ thể:**
- Điều khiển servo phễu theo chu kì để nhả hạt từng cái một
- Đọc tín hiệu cảm biến IR để phát hiện hạt trên băng chuyền
- Delay 500ms sau khi IR kích hoạt để hạt nằm vào vùng chụp tối ưu
- Ngắt relay dừng băng chuyền trong khi chụp và phân loại
- Gửi lệnh trigger cho ESP32-CAM qua UART
- Nhận kết quả phân loại từ ESP32-CAM và điều khiển servo tương ứng
- Xử lý nút dừng khẩn qua ngắt cứng (interrupt) trên INT0 (D2)

### ESP32-CAM (AI Thinker) — Mắt của hệ thống

ESP32-CAM kết nối WiFi, stream video liên tục để kiểm tra (cổng 81/stream), và khi nhận lệnh trigger từ Arduino thì chụp ảnh tĩnh gửi lên server.

**Nhiệm vụ cụ thể:**
- Duy trì kết nối WiFi và HTTP server stream (port 81)
- Nhận lệnh `"1-{flashValue}\n"` từ Arduino qua UART
- Bật flash LED với giá trị nhận được (khuyến nghị 20-25/255)
- Chụp ảnh JPEG SVGA sau khi flash ổn định (~80ms)
- HTTP POST ảnh lên `SERVER_URL/upload`
- Parse kết quả JSON `{"class": 1, "conf": 0.87}` từ server
- Chuyển tiếp kết quả về Arduino qua UART

### Cảm biến IR — Cổng vào của chu trình

Cảm biến hồng ngoại phản xạ (FC-51 hoặc tương đương) phát hiện khi hạt điều đi qua. Ngõ ra DATA xuống LOW khi có vật cản. Arduino đọc tín hiệu này trên D9 với `INPUT_PULLUP`, debounce bằng `millis()` tối thiểu 1200ms giữa hai lần kích hoạt.

### Relay module — Công tắc băng chuyền

Relay 5V opto-isolated điều khiển nguồn motor băng chuyền. Dùng chân NO (Normally Open): mặc định băng chuyền chạy, khi Arduino kéo chân IN xuống LOW thì relay mở, băng dừng. Opto-isolator bảo vệ Arduino khỏi nhiễu điện từ motor.

**Cách mắc đề xuất:**
- Chân điều khiển: VCC→5V Arduino, GND→GND, IN→D3 Arduino
- Chân tải: COM→nguồn motor, NO→motor băng chuyền
- Dùng diode fly-back 1N4007 song song với cuộn motor nếu là DC motor

### Servo phễu (D8) — Kiểm soát lưu lượng hạt

Servo này gạt cần gạt trên phễu theo chu kì định sẵn để nhả hạt từng cái một xuống băng chuyền. Tránh nhiều hạt xuống cùng lúc gây kẹt hoặc nhận diện sai.

### Servo Gate (D5) — Bộ lọc chất lượng nhận diện

Servo đặt ngay đầu khu vực phân loại. Mặc định **đóng** (chắn luồng về reject bin). Chỉ mở khi kết quả AI có confidence ≥ 50%. Nếu không đủ confidence (ảnh mờ, mất hạt, background), servo giữ nguyên → hạt rơi xuống reject bin để kiểm tra lại thủ công.

### Servo 1 (D6) — Phân loại hạt vỡ

Servo đặt tại điểm rẽ đầu tiên. Chỉ mở khi class = 2 (Broken) hoặc class = 3 (Defect). Khi class = 1 (Whole), servo giữ neutral → hạt theo dòng băng chuyền rơi xuống khay Whole.

### Servo 2 (D7) — Phân loại hạt hỏng

Servo đặt tại điểm rẽ thứ hai, sau Servo 1. Chỉ mở khi class = 3 (Defect). Kết hợp: Servo 1 mở + Servo 2 mở = hạt đến cuối băng → khay Defect.

## Sơ đồ phân khu vật lý trên băng chuyền

```
[Phễu]
  │ Servo phễu (D8) — nhả từng hạt
  ▼
[IR sensor] ── phát hiện hạt ──► Arduino trigger
  │
  ▼  (delay 500ms, băng dừng)
[Vùng chụp] ── ESP32-CAM chụp ảnh
  │
  ▼
[Servo Gate D5] ──── confidence < 50% ──► [Reject Bin]
  │ confidence ≥ 50%, mở gate
  ▼
[Servo 1 D6]
  ├── class=1 (Whole): đóng ──────────────► [Khay Whole ↓]
  └── class=2/3: mở ─► [Servo 2 D7]
                            ├── class=2 (Broken): đóng ─► [Khay Broken ↓]
                            └── class=3 (Defect): mở ───► [Khay Defect ↓ cuối băng]
```

## Hướng phát triển tương lai

**Xử lý lỗi mặt dưới hạt** (chưa triển khai, để phát triển sau):

Hạt bị vỡ hoặc đen ở mặt dưới sẽ không bị phát hiện với camera nhìn từ trên. Một số phương án kỹ thuật khả thi:

- **Gương nghiêng 45°**: đặt gương dưới băng chuyền trong suốt, camera nhìn cả mặt dưới trong cùng 1 frame — chi phí thấp, không cần thêm board
- **Camera thứ hai (ESP32-CAM thứ 2)**: nhìn từ góc dưới, kết quả ensemble ở server — tăng độ chính xác, tăng chi phí và độ phức tạp
- **Đèn chiếu dưới + băng chuyền trong suốt**: phát hiện vết đen qua độ truyền sáng (transmittance) — phù hợp phát hiện lỗi màu sắc, không phát hiện được hình dạng