# Wiring Diagram — Cashew Nut Classification System

Tài liệu kết nối chân chi tiết cho toàn bộ phần cứng. Đọc kỹ phần **Lưu ý nguồn điện** trước khi lắp ráp.

## Lưu ý quan trọng

- **Nguồn servo**: Tuyệt đối không lấy nguồn 4 servo từ chân 5V của Arduino. Dùng nguồn ngoài 5V/2A, chỉ nối chung GND với Arduino.
- **Chung GND**: Tất cả thiết bị phải chung một điểm GND. Không chung GND là nguyên nhân phổ biến nhất gây giao tiếp Serial thất bại.
- **Relay opto-isolated**: Dùng relay có opto-isolator để tách biệt mạch điều khiển (5V Arduino) và mạch tải (motor băng chuyền).

## Sơ đồ tổng thể

```
                        ┌────────────────────────────────┐
                        │         Arduino UNO            │
                        │                                │
  IR Sensor ────── D9   │   D5 ──────── Servo Gate       │
  Nút dừng  ────── D2   │   D6 ──────── Servo 1 (Broken) │
  Relay IN  ────── D3   │   D7 ──────── Servo 2 (Defect) │
  ESP32 TX  ────── D10  │   D8 ──────── Servo Phễu       │
  ESP32 RX  ────── D11  │   5V ──────── Nguồn ngoài 5V   │
                        │   GND ─────── GND chung        │
                        └───────────────┬────────────────┘
                                        │ UART (D10/D11)
                        ┌───────────────▼────────────────┐
                        │         ESP32-CAM              │
                        │  GPIO15 (RX) ← D11 (TX) Ard    │
                        │  GPIO14 (TX) → D10 (RX) Ard    │
                        │  GND        ←→ GND chung       │
                        │  WiFi ──────► Server AI        │
                        └────────────────────────────────┘
```

## Bảng kết nối chi tiết

### 1. ESP32-CAM ↔ Arduino UNO (UART Serial)

| ESP32-CAM | | Arduino UNO | Ghi chú |
|---|---|---|---|
| GND | ── | GND | Bắt buộc chung GND |
| GPIO15 (RX) | ◄─ | D11 (TX) | |
| GPIO14 (TX) | ─► | D10 (RX) | |

### 2. Arduino ↔ IR Sensor (FC-51 hoặc E18-D80NK)

| Arduino | | IR Sensor | Ghi chú |
|---|---|---|---|
| GND | ── | GND | |
| 5V | ── | VCC | |
| D9 | ◄─ | DATA (OUT) | `INPUT_PULLUP`, LOW khi có vật |

> Điều chỉnh biến trở trên FC-51 để khoảng cách phát hiện phù hợp (~2-5cm với hạt điều).

### 3. Arduino ↔ Servo Phễu (D8)

| Arduino | | Servo | Ghi chú |
|---|---|---|---|
| GND | ── | GND (dây nâu/đen) | Chung GND với nguồn ngoài |
| Nguồn ngoài 5V | ── | VCC (dây đỏ) | **Không lấy từ Arduino 5V** |
| D8 | ── | Signal (dây vàng/cam) | PWM điều khiển |

### 4. Arduino ↔ Servo Gate (D5)

| Arduino | | Servo | Ghi chú |
|---|---|---|---|
| GND | ── | GND (dây nâu/đen) | |
| Nguồn ngoài 5V | ── | VCC (dây đỏ) | |
| D5 | ── | Signal (dây vàng/cam) | Mặc định đóng, mở khi conf ≥ 80% |

### 5. Arduino ↔ Servo 1 — Broken (D6)

| Arduino | | Servo | Ghi chú |
|---|---|---|---|
| GND | ── | GND | |
| Nguồn ngoài 5V | ── | VCC | |
| D6 | ── | Signal | Gạt khi class = 2 hoặc 3 |

### 6. Arduino ↔ Servo 2 — Defect (D7)

| Arduino | | Servo | Ghi chú |
|---|---|---|---|
| GND | ── | GND | |
| Nguồn ngoài 5V | ── | VCC | |
| D7 | ── | Signal | Gạt khi class = 3 |

### 7. Arduino ↔ Relay Module (D3)

| Arduino | | Relay Module | Ghi chú |
|---|---|---|---|
| GND | ── | GND | |
| 5V | ── | VCC | Cuộn relay lấy từ Arduino 5V OK |
| D3 | ── | IN | LOW = relay kích hoạt |

**Phía tải (motor băng chuyền)**:

| Relay Terminal | | Kết nối | Ghi chú |
|---|---|---|---|
| COM | ── | Nguồn motor (+) | |
| NO | ── | Motor băng chuyền (+) | Normally Open: băng chạy khi relay OFF |
| (NC để trống) | | | |

> Nếu motor DC, hàn diode 1N4007 song song với 2 cực motor (Cathode về phía dương nguồn) để triệt xung ngược khi tắt motor.

### 8. Arduino ↔ Nút dừng khẩn (D2 — INT0)

| Arduino | | Nút nhấn | Ghi chú |
|---|---|---|---|
| GND | ── | Chân 1 nút | |
| D2 | ── | Chân 2 nút | `INPUT_PULLUP` + `attachInterrupt(INT0, ...)` |

> Dùng `FALLING` interrupt: khi nhấn nút (5V→GND), ISR kích hoạt ngay lập tức, ngắt relay trong ISR hoặc set flag để loop() xử lý.

## Tóm tắt chân Arduino UNO

| Chân | Loại | Kết nối | Vai trò |
|---|---|---|---|
| D2 | Digital In (INT0) | Nút dừng khẩn | Hardware interrupt, active LOW |
| D3 | Digital Out (PWM) | Relay IN | LOW = dừng băng chuyền |
| D5 | Digital Out (PWM) | Servo Gate | Chặn luồng khi confidence thấp |
| D6 | Digital Out (PWM) | Servo 1 | Phân loại Broken |
| D7 | Digital Out (PWM) | Servo 2 | Phân loại Defect |
| D8 | Digital Out (PWM) | Servo Phễu | Nhả hạt theo chu kì |
| D9 | Digital In | IR Sensor DATA | Active LOW, `INPUT_PULLUP` |
| D10 | SoftwareSerial RX | ESP32 GPIO14 (TX) | Nhận kết quả AI |
| D11 | SoftwareSerial TX | ESP32 GPIO15 (RX) | Gửi lệnh trigger |
| 5V | Power Out | Relay VCC, IR VCC | Chỉ cấp thiết bị nhỏ |
| GND | Ground | GND chung toàn hệ thống | |

## Tóm tắt chân ESP32-CAM (AI Thinker)

| Chân | Kết nối | Vai trò |
|---|---|---|
| GPIO14 (TX) | Arduino D10 (RX) | Gửi kết quả phân loại |
| GPIO15 (RX) | Arduino D11 (TX) | Nhận lệnh trigger |
| GPIO4 | Flash LED (built-in) | Đèn chụp ảnh, PWM `ledcAttach` |
| GND | GND chung | |
| 3.3V / 5V | Nguồn cấp | Cấp từ FTDI khi debug, từ LDO riêng khi chạy thực |
| GPIO0 | GND khi nạp firmware | Kéo GND để vào boot mode |
| U0T, U0R | FTDI TX/RX | Chỉ dùng khi nạp firmware / debug |

## Sơ đồ nguồn điện

```
Nguồn 5V/2A ngoài
        │
        ├──── VCC ──► Servo Gate (D5)
        ├──── VCC ──► Servo 1 (D6)
        ├──── VCC ──► Servo 2 (D7)
        ├──── VCC ──► Servo Phễu (D8)
        └──── GND ──┐
                    │
Arduino UNO 5V ─────┤ (chỉ cấp IR, Relay)
                    │
ESP32-CAM GND ──────┤
                    │
Motor GND ──────────┘
         GND chung
```