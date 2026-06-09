#include <Servo.h>

// =============================================================================
// FIRMWARE DEMO MÔ PHỎNG (KHÔNG CẦN ESP32-CAM VÀ SERVER)
// Chức năng: Chạy chu trình mở phễu -> chờ IR -> chờ (mô phỏng AI delay) -> mở gate -> lặp lại
// =============================================================================

Servo servoGate;
Servo servo1;
Servo servo2;
Servo servoFunnel;

#define servoGatePin   5
#define servoPin1      6
#define servoPin2      7
#define servoFunnelPin 8

#define buttonPin 2
#define relayPin  3
#define irPin     9

// --- Góc servo ---
const int SERVO_CLOSED = 135;
const int SERVO_OPEN   = 180;
const int SERVO_FUNNEL_CLOSED = 0;
const int SERVO_FUNNEL_OPEN   = 75;

// --- Timing (ms) ---
const unsigned long FUNNEL_OPEN_DURATION = 1500;
const unsigned long IR_DELAY_MS          = 300;

// Các mức delay di chuyển trên băng chuyền
const int WHOLE_DELAY  = 6000;
const int BROKEN_DELAY = 6500;
const int DEFECT_DELAY = 7000;

// --- Trạng thái ---
volatile bool buttonFlag = false;
unsigned long lastButtonMs = 0;
const unsigned long BUTTON_DEBOUNCE_MS = 300;

unsigned long stateEnteredMs = 0;
unsigned long sortingDelay = 0;

// Random AI Response
unsigned long simAiDelay = 0;

enum SystemState {
  STATE_STOPPED,
  STATE_FUNNEL_OPEN,
  STATE_WAIT_IR,
  STATE_SIM_CAPTURING, // Trạng thái mô phỏng chờ AI
  STATE_SORTING
};
SystemState currentState = STATE_STOPPED;

// =============================================================================
void buttonISR() {
  buttonFlag = true;
}

void conveyorRun() {
  digitalWrite(relayPin, HIGH);
  Serial.println("[ RELAY ] Băng chuyền: CHẠY");
}

void conveyorStop() {
  digitalWrite(relayPin, LOW);
  Serial.println("[ RELAY ] Băng chuyền: DỪNG");
}

void allServosClose() {
  servoGate.write(SERVO_CLOSED);
  servo1.write(SERVO_CLOSED);
  servo2.write(SERVO_CLOSED);
  Serial.println("[ SERVO ] Tất cả servo phân loại ĐÓNG");
}

void funnelOpen() {
  servoFunnel.write(SERVO_FUNNEL_OPEN);
  Serial.println("[ FUNNEL ] Phễu MỞ → nhả hạt");
}

void funnelClose() {
  servoFunnel.write(SERVO_FUNNEL_CLOSED);
  Serial.println("[ FUNNEL ] Phễu ĐÓNG");
}

void changeState(SystemState newState) {
  currentState = newState;
  stateEnteredMs = millis();
}

// Xử lý random class và tính sortingDelay
void applyRandomClass() {
  // Random kết quả AI từ 1 đến 3
  int cls = random(1, 4); 
  conveyorRun();

  if (cls == 1) sortingDelay = WHOLE_DELAY;
  else if (cls == 2) sortingDelay = BROKEN_DELAY;
  else if (cls == 3) sortingDelay = DEFECT_DELAY;

  Serial.print("[ DEMO ] Kết quả random: Class ");
  Serial.println(cls);

  if (cls == 1) {
    Serial.println(" -> WHOLE: Mở servoGate");
    servoGate.write(SERVO_OPEN);
  } else if (cls == 2) {
    Serial.println(" -> BROKEN: Mở servoGate + servo1");
    servoGate.write(SERVO_OPEN);
    servo1.write(SERVO_OPEN);
  } else if (cls == 3) {
    Serial.println(" -> DEFECT: Mở tất cả servo");
    servoGate.write(SERVO_OPEN);
    servo1.write(SERVO_OPEN);
    servo2.write(SERVO_OPEN);
  }

  changeState(STATE_SORTING);
  Serial.print("[ STATE ] Chuyển sang STATE_SORTING (delay = ");
  Serial.print(sortingDelay);
  Serial.println(" ms)");
}

// =============================================================================
void setup() {
  Serial.begin(115200);
  
  // Random seed
  randomSeed(analogRead(0));

  servoGate.attach(servoGatePin);
  servo1.attach(servoPin1);
  servo2.attach(servoPin2);
  servoFunnel.attach(servoFunnelPin);
  
  allServosClose();
  funnelClose();

  pinMode(buttonPin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(buttonPin), buttonISR, FALLING);

  pinMode(relayPin, OUTPUT);
  conveyorStop();

  pinMode(irPin, INPUT_PULLUP);

  delay(500);
  Serial.println("\n----- CASHEW DEMO MODE (NO ESP32) -----");
  Serial.println("Nhấn nút (D2) để bắt đầu...");
}

// =============================================================================
void loop() {
  unsigned long now = millis();

  // Nút nhấn: Start / Stop toggle
  if (buttonFlag) {
    buttonFlag = false;
    if (now - lastButtonMs < BUTTON_DEBOUNCE_MS) return;
    lastButtonMs = now;

    if (currentState == STATE_STOPPED) {
      changeState(STATE_FUNNEL_OPEN);
      funnelOpen();
      conveyorRun();
      Serial.println("[ BUTTON ] Hệ thống BẮT ĐẦU → STATE_FUNNEL_OPEN");
    } else {
      changeState(STATE_STOPPED);
      conveyorStop();
      allServosClose();
      funnelClose();
      Serial.println("[ BUTTON ] DỪNG KHẨN CẤP → STATE_STOPPED");
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
        Serial.println("[ STATE ] Phễu đóng → STATE_WAIT_IR (chờ hạt qua IR)");
      }
      break;
      
    case STATE_WAIT_IR:
      if (digitalRead(irPin) == LOW) {
        Serial.println("[ IR ] Phát hiện hạt đi qua!");
        delay(IR_DELAY_MS);
        conveyorStop(); 
        
        simAiDelay = random(600, 801);
        Serial.print("[ SIM ] Bắt đầu mô phỏng AI (delay ");
        Serial.print(simAiDelay);
        Serial.println(" ms)...");

        changeState(STATE_SIM_CAPTURING);
      }
      break;

    case STATE_SIM_CAPTURING:
      if (now - stateEnteredMs >= simAiDelay) {
        applyRandomClass();
      }
      break;

    case STATE_SORTING:
      if (now - stateEnteredMs >= sortingDelay) {
        allServosClose();
        Serial.println("--- Xong một chu kỳ phân loại ---");
        
        changeState(STATE_FUNNEL_OPEN);
        funnelOpen();
        Serial.println("[ STATE ] → STATE_FUNNEL_OPEN (chu kỳ mới)");
      }
      break;
  }
}
