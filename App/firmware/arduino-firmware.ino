#include <Servo.h>
#include <SoftwareSerial.h>
#if defined(__AVR__)
#include <avr/wdt.h>
#endif

// =============================================================================
// PIN MAPPING
// RX=10 (nhận từ GPIO14 ESP32-CAM), TX=11 (gửi tới GPIO15 ESP32-CAM)
// =============================================================================
SoftwareSerial mySerial(10, 11);

// --- Servo ---
Servo servoGate;
Servo servo1;
Servo servo2;

#define servoGatePin  5
#define servoPin1     6
#define servoPin2     7

#define relayPin  3

#define RELAY_HARDWARE_CONNECTED true

// --- Relay: chọn đúng cách nối tải (COM + NO hoặc COM + NC) ---
// COM + NO: coil ON → NO đóng → thường dùng để BẬT motor (RELAY_LOAD_ON_NC = false).
// COM + NC: coil OFF → NC đóng → thường dùng FAIL-SAFE (mất điện coil thì motor vẫn có thể chạy
//           tùy mạch). Khi đó CHẠY = tắt coil, DỪNG = bật coil (RELAY_LOAD_ON_NC = true).
#ifndef RELAY_LOAD_ON_NC
#define RELAY_LOAD_ON_NC true
#endif
// Module xanh: IN = LOW thường là coil ON. Nếu RUN/STOP ngược thực tế → đổi RELAY_ACTIVE_LOW.
#ifndef RELAY_ACTIVE_LOW
#define RELAY_ACTIVE_LOW true
#endif

// true = sau RESET/MỞ ĐIỆN tự chạy băng (conveyorRun). false = giữ DỪNG cho đến khi gõ RELAY:RUN (tránh "vừa STOP lại thấy CHẠY" khi board reset).
#ifndef START_CONVEYOR_ON_BOOT
#define START_CONVEYOR_ON_BOOT true
#endif

// coil true = bật cuộn dây, false = tắt cuộn
static void relaySetCoil(bool coilOn) {
#if RELAY_HARDWARE_CONNECTED
  int pinLevel;
  if (RELAY_ACTIVE_LOW) {
    pinLevel = coilOn ? LOW : HIGH;
  } else {
    pinLevel = coilOn ? HIGH : LOW;
  }
  digitalWrite(relayPin, pinLevel);
#endif
}

// --- IR sensor ---
#define irPin  9

const int GATE_CLOSED  = 135;
const int GATE_OPEN    = 180;
const int SERVO_CLOSED = 135;
const int SERVO_OPEN   = 180;

int currentFlashValue = 20;
int countClassify = 0;

unsigned long lastTriggerMs = 0;
const unsigned long DEBOUNCE_MS = 1500;

bool waitingForResult = false;

unsigned long gateOpenUntilMs = 0;
bool gateIsOpen = false;

// Dừng bằng Serial "RELAY:STOP": không cho các nhánh tự động (ESP gửi "0", hết timer servo) bật lại băng.
// Gõ "RELAY:RUN" hoặc "r" để chạy lại. (Nút dừng trên app/mobile không tới Arduino trừ khi bạn nối thêm lệnh UART/MQTT.)
static bool beltManualStop = false;

// =============================================================================
// ĐIỀU KHIỂN BĂNG CHUYỀN (relay)
// =============================================================================
void conveyorRun() {
#if RELAY_HARDWARE_CONNECTED
  // NO: chạy = coil ON | NC: chạy = coil OFF (NC đóng)
  relaySetCoil(!RELAY_LOAD_ON_NC);
#endif
  Serial.println(RELAY_LOAD_ON_NC
                   ? "[RELAY] CHẠY (NC: coil OFF)"
                   : "[RELAY] CHẠY (NO: coil ON)");
}

void conveyorStop() {
#if RELAY_HARDWARE_CONNECTED
  relaySetCoil(RELAY_LOAD_ON_NC);
#endif
  Serial.println(RELAY_LOAD_ON_NC
                   ? "[RELAY] DỪNG (NC: coil ON, NC mở)"
                   : "[RELAY] DỪNG (NO: coil OFF, NO mở)");
}

// Chỉ dùng sau phân loại / hết timer servo — tôn trọng RELAY:STOP
static void conveyorRunAuto() {
  if (beltManualStop) {
    Serial.println("[RELAY] Giu DUNG (RELAY:STOP), bo qua chay tu dong");
    return;
  }
  conveyorRun();
}

void allServosClose() {
  servoGate.write(GATE_CLOSED);
  servo1.write(SERVO_CLOSED);
  servo2.write(SERVO_CLOSED);
  gateIsOpen = false;
  Serial.println("Tất cả servo ĐÓNG");
}

void openServosForClass(int cls) {
  switch (cls) {
    case 0:
      Serial.println("Accuracy thap -> chay lai bang (neu khong STOP tay)");
      conveyorRunAuto();
      waitingForResult = false;
      return;

    case 1:
      Serial.println("WHOLE → Mở servoGate");
      servoGate.write(GATE_OPEN);
      break;

    case 2:
      Serial.println("BROKEN → Mở servoGate + servo1");
      servoGate.write(GATE_OPEN);
      servo1.write(SERVO_OPEN);
      break;

    case 3:
      Serial.println("DEFECT → Mở tất cả servo");
      servoGate.write(GATE_OPEN);
      servo1.write(SERVO_OPEN);
      servo2.write(SERVO_OPEN);
      break;

    default:
      Serial.print("Lệnh không hợp lệ: ");
      Serial.println(cls);
      conveyorRunAuto();
      waitingForResult = false;
      return;
  }

  gateIsOpen = true;
  gateOpenUntilMs = millis() + 1000;
}

void updateServos() {
  if (gateIsOpen && millis() >= gateOpenUntilMs) {
    allServosClose();
    conveyorRunAuto();
    waitingForResult = false;
    Serial.println("Het timer servo");
  }
}

void triggerCapture() {
  waitingForResult = true;
  // Luon dung bang de chup (khong bi chan boi beltManualStop).
  conveyorStop();

  delay(500);

  String cmd = "1-" + String(currentFlashValue);
  mySerial.println(cmd);
  Serial.print("IR trigger → Gửi ESP32: ");
  Serial.println(cmd);
}

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);
#if defined(__AVR__)
  uint8_t mcusr = MCUSR;
  MCUSR = 0;
  wdt_disable();
#endif

  servoGate.attach(servoGatePin);
  servo1.attach(servoPin1);
  servo2.attach(servoPin2);
  allServosClose();

  pinMode(relayPin, OUTPUT);
#if START_CONVEYOR_ON_BOOT
  beltManualStop = false;
  conveyorRun();
#else
  beltManualStop = true;
  conveyorStop();
#endif

  pinMode(irPin, INPUT_PULLUP);

  delay(500);
  Serial.println("\n----- CASHEW CLASSIFIER - ARDUINO -----");
#if defined(__AVR__)
  Serial.print("BOOT MCUSR=0x");
  Serial.print(mcusr, HEX);
  Serial.println(" (MCUSR: PORF/EXTRF/BORF/WDRF — nhieu lan reset = nhieu dong BOOT)");
#endif
  Serial.println("s=chup | r=chay lai | RELAY:RUN | RELAY:STOP (STOP = khoa, khong tu bat lai)");
  Serial.println("Nut Stop tren app khong noi relay Arduino; can UART hoac relay rieng.");
}

void loop() {
  unsigned long now = millis();

  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() > 0) {
      if (input.equalsIgnoreCase("s")) {
        if (!waitingForResult) {
          lastTriggerMs = now;
          triggerCapture();
        } else {
          Serial.println("Dang cho ket qua AI...");
        }
      } else if (input.equalsIgnoreCase("r")) {
        allServosClose();
        beltManualStop = false;
        conveyorRun();
        waitingForResult = false;
      } else if (input.equalsIgnoreCase("RELAY:RUN")) {
        beltManualStop = false;
        conveyorRun();
      } else if (input.equalsIgnoreCase("RELAY:STOP")) {
        beltManualStop = true;
        conveyorStop();
      } else {
        int val = input.toInt();
        if (val > 0 || input == "0") {
          currentFlashValue = constrain(val, 0, 255);
          Serial.print("Flash: ");
          Serial.println(currentFlashValue);
        }
      }
    }
  }

  if (!waitingForResult
      && digitalRead(irPin) == LOW
      && (now - lastTriggerMs) >= DEBOUNCE_MS) {
    lastTriggerMs = now;
    delay(800);
    triggerCapture();
  }

  if (mySerial.available() > 0) {
    String data = mySerial.readStringUntil('\n');
    data.trim();

    if (data.length() > 0) {
      int command = data.toInt();
      countClassify++;
      Serial.print("[#"); Serial.print(countClassify);
      Serial.print("] ESP: "); Serial.println(command);
      openServosForClass(command);
    }
  }

  updateServos();
}
