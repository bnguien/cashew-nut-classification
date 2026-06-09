#include <Servo.h>
#include <SoftwareSerial.h>

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
#define irPin  9

const int GATE_CLOSED  = 135;
const int GATE_OPEN    = 180;
const int SERVO_CLOSED = 135;
const int SERVO_OPEN   = 180;

int currentFlashValue = 30;
int countClassify = 0;

unsigned long lastTriggerMs = 0;
const unsigned long DEBOUNCE_MS = 3000;

bool waitingForResult = false;

unsigned long gateOpenUntilMs = 0;
bool gateIsOpen = false;

void conveyorRun() {
  digitalWrite(relayPin, HIGH);
  Serial.println("[ RELAY ] Băng chuyền: CHẠY");
}

void conveyorStop() {
  digitalWrite(relayPin, LOW);
  Serial.println("[ RELAY ] Băng chuyền: DỪNG");
}

void allServosClose() {
  servoGate.write(GATE_CLOSED);
  servo1.write(SERVO_CLOSED);
  servo2.write(SERVO_CLOSED);
  gateIsOpen = false;
  Serial.println("[ SERVO ] Tất cả servo ĐÓNG");
}

const int WHOLE_DELAY = 6000;
const int BROKEN_DELAY = 6500;
const int DEFECT_DELAY = 7000;

void openServosForClass(int cls) {
  conveyorRun();
  long currentDelay = 0;
  if (cls == 1) currentDelay = WHOLE_DELAY;
  else if (cls == 2) currentDelay = BROKEN_DELAY;
  else if (cls == 3) currentDelay = DEFECT_DELAY;

  switch (cls) {
    case 0:
      Serial.println("[ RESULT ] Accuracy thấp → Giữ đóng, chạy lại băng chuyền");
      waitingForResult = false;
      return;

    case 1:
      Serial.println("[ RESULT ] WHOLE → Mở servoGate");
      servoGate.write(GATE_OPEN);
      break;

    case 2:
      Serial.println("[ RESULT ] BROKEN → Mở servoGate + servo1");
      servoGate.write(GATE_OPEN);
      servo1.write(SERVO_OPEN);
      break;

    case 3:
      Serial.println("[ RESULT ] DEFECT → Mở tất cả servo");
      servoGate.write(GATE_OPEN);
      servo1.write(SERVO_OPEN);
      servo2.write(SERVO_OPEN);
      break;

    default:
      Serial.print("[ RESULT ] Lệnh không hợp lệ: ");
      Serial.println(cls);
      conveyorRun();
      waitingForResult = false;
      return;
  }

  gateIsOpen = true;
  gateOpenUntilMs = millis() + currentDelay;
}

void updateServos() {
  if (gateIsOpen && millis() >= gateOpenUntilMs) {
    allServosClose();
    waitingForResult = false; 
    lastTriggerMs = millis(); 
    conveyorRun();

    Serial.println("--- Xong một chu kỳ phân loại ---");
  }
}

void triggerCapture() {
  waitingForResult = true;
  delay(300);
  conveyorStop();

  String cmd = "1-" + String(currentFlashValue);
  mySerial.println(cmd);
  Serial.print("[ IR ] TRIGGER -> Đã vào vùng chụp -> Dừng & Gửi ESP32:");
  Serial.println(cmd);
}

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);

  servoGate.attach(servoGatePin);
  servo1.attach(servoPin1);
  servo2.attach(servoPin2);
  allServosClose();

  pinMode(relayPin, OUTPUT);
  conveyorRun();

  pinMode(irPin, INPUT_PULLUP);

  delay(500);
  Serial.println("\n----- CASHEW CLASSIFIER - ARDUINO -----");
}

void loop() {
  unsigned long now = millis();

  if (mySerial.available() > 0) {
    String data = mySerial.readStringUntil('\n');
    data.trim();
    if (data.length() > 0) {
      int command = data.toInt();
      openServosForClass(command);
    }
  }

  if (!waitingForResult
      && digitalRead(irPin) == LOW
      && (now - lastTriggerMs) >= DEBOUNCE_MS) {
        
    lastTriggerMs = now;
    triggerCapture();
  }

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
        conveyorRun();
        waitingForResult = false;
      } else if (input.equalsIgnoreCase("RELAY:RUN")) {
        conveyorRun();
      } else if (input.equalsIgnoreCase("RELAY:STOP")) {
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

  updateServos();
}