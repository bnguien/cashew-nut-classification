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
Servo servoFunnel;

#define servoGatePin    5
#define servoPin1       6
#define servoPin2       7
#define servoFunnelPin  8

#define buttonPin 2
#define relayPin  3
#define irPin     9

const int SERVO_CLOSED = 135;
const int SERVO_OPEN   = 180;
const int SERVO_FUNNEL_CLOSED = 0;
const int SERVO_FUNNEL_OPEN   = 75;

// --- Timing ---
const unsigned long FUNNEL_OPEN_DURATION = 1500;   
const unsigned long CAPTURE_TIMEOUT_MS   = 15000;  
const unsigned long IR_DELAY_MS          = 80;   
const unsigned long WAIT_IR_TIMEOUT_MS   = 7000; 

const int WHOLE_DELAY  = 6000;
const int BROKEN_DELAY = 6500;
const int DEFECT_DELAY = 7000;

volatile bool buttonFlag = false;
unsigned long lastButtonMs = 0;
const unsigned long BUTTON_DEBOUNCE_MS = 300;

int currentFlashValue = 30;
int countClassify = 0;

unsigned long stateEnteredMs = 0;
unsigned long sortingDelay = 0;

// STATE MACHINE
enum SystemState {
  STATE_STOPPED,       
  STATE_FUNNEL_OPEN,   
  STATE_WAIT_IR,       
  STATE_CAPTURING,     
  STATE_SORTING        
};
SystemState currentState = STATE_FUNNEL_OPEN;

// =============================================================================
// LOGGING SYSTEM
// =============================================================================
void printLogPrefix(const char* level) {
  unsigned long ms = millis();
  unsigned long seconds = ms / 1000;
  unsigned long frac = ms % 1000;
  
  Serial.print("[");
  Serial.print(seconds);
  Serial.print(".");
  if (frac < 100) Serial.print("0");
  if (frac < 10) Serial.print("0");
  Serial.print(frac);
  Serial.print("] [");
  Serial.print(level);
  Serial.print("] ");
}

#define LOG_INFO(msg)         do { printLogPrefix("INFO"); Serial.println(msg); } while(0)
#define LOG_WARN(msg)         do { printLogPrefix("WARN"); Serial.println(msg); } while(0)
#define LOG_ERROR(msg)        do { printLogPrefix("ERROR"); Serial.println(msg); } while(0)
#define LOG_DEBUG(msg)        do { printLogPrefix("DEBUG"); Serial.println(msg); } while(0)

#define LOG_INFO_V(msg, val)  do { printLogPrefix("INFO"); Serial.print(msg); Serial.println(val); } while(0)
#define LOG_WARN_V(msg, val)  do { printLogPrefix("WARN"); Serial.print(msg); Serial.println(val); } while(0)
#define LOG_ERROR_V(msg, val) do { printLogPrefix("ERROR"); Serial.print(msg); Serial.println(val); } while(0)
#define LOG_DEBUG_V(msg, val) do { printLogPrefix("DEBUG"); Serial.print(msg); Serial.println(val); } while(0)

void buttonISR() {
  buttonFlag = true;
}

void conveyorRun() {
  digitalWrite(relayPin, HIGH);
  LOG_INFO("Băng chuyền: CHẠY");
}

void conveyorStop() {
  digitalWrite(relayPin, LOW);
  LOG_INFO("Băng chuyền: DỪNG");
}

void allServosClose() {
  servoGate.write(SERVO_CLOSED);
  servo1.write(SERVO_CLOSED);
  servo2.write(SERVO_CLOSED);
  LOG_INFO("Tất cả servo phân loại ĐÓNG");
}

void funnelOpen() {
  servoFunnel.write(SERVO_FUNNEL_OPEN);
  LOG_INFO("Phễu MỞ -> nhả hạt");
}

void funnelClose() {
  servoFunnel.write(SERVO_FUNNEL_CLOSED);
  LOG_INFO("Phễu ĐÓNG");
}

void changeState(SystemState newState) {
  currentState = newState;
  stateEnteredMs = millis();
}

// XỬ LÝ KẾT QUẢ PHÂN LOẠI
void openServosForClass(int cls) {
  conveyorStop();

  switch (cls) {
    case 0:
      LOG_WARN("Accuracy thấp -> Reject bin (gate đóng, chạy băng)");
      allServosClose();
      sortingDelay = DEFECT_DELAY; 
      break;

    case 1:
      LOG_INFO("RESULT: WHOLE -> Mở servoGate");
      servoGate.write(SERVO_OPEN);
      sortingDelay = WHOLE_DELAY;
      break;

    case 2:
      LOG_INFO("RESULT: BROKEN -> Mở servoGate + servo1");
      servoGate.write(SERVO_OPEN);
      servo1.write(SERVO_OPEN);
      sortingDelay = BROKEN_DELAY;
      break;

    case 3:
      LOG_INFO("RESULT: DEFECT -> Mở tất cả servo");
      servoGate.write(SERVO_OPEN);
      servo1.write(SERVO_OPEN);
      servo2.write(SERVO_OPEN);
      sortingDelay = DEFECT_DELAY;
      break;

    default:
      LOG_ERROR_V("Lệnh không hợp lệ: ", cls);
      allServosClose();
      sortingDelay = DEFECT_DELAY;
      break;
  }

  conveyorRun(); 
  changeState(STATE_SORTING);
  countClassify++;
  
  printLogPrefix("INFO");
  Serial.print("CLASSIFY #");
  Serial.print(countClassify);
  Serial.print(" | class=");
  Serial.print(cls);
  Serial.print(" | delay=");
  Serial.println(sortingDelay);
}

void triggerCapture() {
  delay(IR_DELAY_MS);
  conveyorStop();

  String cmd = "1-" + String(currentFlashValue);
  mySerial.println(cmd);
  
  printLogPrefix("INFO");
  Serial.print("TRIGGER -> Dừng băng & Gửi ESP32: ");
  Serial.println(cmd);

  changeState(STATE_CAPTURING);
}

void setup() {
  Serial.begin(115200);
  mySerial.begin(9600);

  // Attach servos
  servoGate.attach(servoGatePin);
  servo1.attach(servoPin1);
  servo2.attach(servoPin2);
  servoFunnel.attach(servoFunnelPin);
  allServosClose();
  funnelClose();

  // Nút nhấn — INPUT_PULLUP, interrupt FALLING
  pinMode(buttonPin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(buttonPin), buttonISR, FALLING);

  // Relay
  pinMode(relayPin, OUTPUT);
  conveyorRun();

  // IR sensor
  pinMode(irPin, INPUT_PULLUP);

  delay(500);
  Serial.println();
  Serial.println("=========================================");
  Serial.println("   CASHEW CLASSIFIER - ARDUINO FIRMWARE  ");
  Serial.println("=========================================");
  LOG_INFO("Bắt đầu: STATE_FUNNEL_OPEN");

  changeState(STATE_FUNNEL_OPEN);
  funnelOpen();
}

void loop() {
  unsigned long now = millis();

  // Đọc lệnh từ ESP32 trước — hoạt động ở MỌI state kể cả STATE_STOPPED
  if (mySerial.available() > 0) {
    String data = mySerial.readStringUntil('\n');
    data.trim();
    if (data.length() > 0) {
      if (data.equalsIgnoreCase("RELAY:RUN")) {
        if (currentState == STATE_STOPPED) {
          conveyorRun();
          funnelOpen();
          changeState(STATE_FUNNEL_OPEN);
          LOG_INFO("[MQTT] RELAY:RUN -> he thong BAT");
        } else {
          LOG_INFO("[MQTT] RELAY:RUN nhan (dang chay, bo qua)");
        }
      } else if (data.equalsIgnoreCase("RELAY:STOP")) {
        conveyorStop();
        allServosClose();
        funnelClose();
        changeState(STATE_STOPPED);
        LOG_WARN("[MQTT] RELAY:STOP -> he thong DUNG");
      } else if (currentState == STATE_CAPTURING) {
        // Kết quả phân loại từ ESP32 (format "val,chk")
        printLogPrefix("DEBUG");
        Serial.print("Raw nhan: '");
        Serial.print(data);
        Serial.print("' | len=");
        Serial.println(data.length());

        int commaIdx = data.indexOf(',');
        if (commaIdx == 1 && data.length() == 3) {
          int val = data.substring(0, 1).toInt();
          int chk = data.substring(2).toInt();
          int expectedChk = (val + 42) % 10;
          if (chk == expectedChk && val >= 0 && val <= 3) {
            LOG_INFO_V("Nhan ket qua hop le: ", val);
            openServosForClass(val);
          } else {
            LOG_WARN("Checksum sai -> bo qua, cho tiep");
          }
        } else if (data.length() > 0) {
          LOG_WARN_V("Bo qua rac: ", data);
        }
      }
    }
  }

  if (buttonFlag) {
    buttonFlag = false;
    if (now - lastButtonMs < BUTTON_DEBOUNCE_MS) return;
    lastButtonMs = now;

    if (currentState == STATE_STOPPED) {
      changeState(STATE_FUNNEL_OPEN);
      funnelOpen();
      conveyorRun();
      mySerial.println("SYS:ON");
      LOG_INFO("Hệ thống BẬT lại -> STATE_FUNNEL_OPEN");
    } else {
      changeState(STATE_STOPPED);
      conveyorStop();
      allServosClose();
      funnelClose();
      mySerial.println("SYS:OFF");
      LOG_WARN("DỪNG KHẨN CẤP -> STATE_STOPPED");
    }
    return; 
  }

  if (currentState == STATE_STOPPED) {
    return;
  }

  switch (currentState) {
    case STATE_FUNNEL_OPEN:
      if (now - stateEnteredMs >= FUNNEL_OPEN_DURATION) {
        funnelClose();
        conveyorRun();
        changeState(STATE_WAIT_IR);
        LOG_DEBUG("Phễu đóng -> STATE_WAIT_IR (chờ hạt)");
      }
      break;

    case STATE_WAIT_IR:
      if (digitalRead(irPin) == LOW) {
        LOG_INFO("Phát hiện hạt!");
        triggerCapture();
      } else if (now - stateEnteredMs >= WAIT_IR_TIMEOUT_MS) {
        LOG_WARN("Timeout: Không phát hiện hạt -> Mở phễu lại");
        changeState(STATE_FUNNEL_OPEN);
        funnelOpen();
      }
      break;

    case STATE_CAPTURING:
      if (now - stateEnteredMs >= CAPTURE_TIMEOUT_MS) {
        LOG_WARN("Timeout AI -> bỏ qua, xuống Reject bin");
        allServosClose();
        sortingDelay = DEFECT_DELAY;
        conveyorRun();
        changeState(STATE_SORTING);
      }
      break;
    case STATE_SORTING:
      if (now - stateEnteredMs >= sortingDelay) {
        allServosClose(); 
        LOG_INFO("--- Xong một chu kỳ phân loại ---");
        changeState(STATE_FUNNEL_OPEN);
        funnelOpen();
        LOG_DEBUG("Chuyển state -> STATE_FUNNEL_OPEN (chu kỳ mới)");
      }
      break;
  }

  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() > 0) {
      if (input.equalsIgnoreCase("s")) {
        if (currentState == STATE_WAIT_IR) {
          triggerCapture();
        } else {
          LOG_WARN_V("Không thể trigger, state hiện tại: ", currentState);
        }
      } else if (input.equalsIgnoreCase("r")) {
        allServosClose();
        funnelClose();
        conveyorRun();
        changeState(STATE_FUNNEL_OPEN);
        funnelOpen();
        LOG_INFO("RESET -> STATE_FUNNEL_OPEN");
      } else if (input.equalsIgnoreCase("state")) {
        LOG_INFO_V("currentState = ", currentState);
      } else {
        int val = input.toInt();
        if (val > 0 || input == "0") {
          currentFlashValue = constrain(val, 0, 255);
          LOG_INFO_V("Flash thay đổi: ", currentFlashValue);
        }
      }
    }
  }
}