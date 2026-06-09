#include <Servo.h>

// --- KHAI BÁO BIẾN & CHÂN CẮM ---
Servo servoGate;
Servo servo1; 
Servo servo2;
Servo servoFunnel;

#define servoGatePin 5
#define servoPin1 6
#define servoPin2 7
#define servoFunnelPin 8

#define relayPin 3
#define triggerPin 9 // Cảm biến hồng ngoại nhận diện hạt tới

// --- CẤU HÌNH GÓC QUAY SERVO ---
const int SERVO_CLOSED = 140;  
const int SERVO_OPEN = 180;     
const int SERVO_MOMENTUM = 160; 

// --- CẤU HÌNH THỜI GIAN  ---
const int DELAY_TO_GATE = 400;  // Từ lúc dừng đến lúc hạt tới Gate
const int DELAY_TO_S1   = 800;  // Từ lúc dừng đến lúc hạt tới Servo 1
const int DELAY_TO_S2   = 1200; // Từ lúc dừng đến lúc hạt tới Servo 2

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50); 

  servoGate.attach(servoGatePin);
  servo1.attach(servoPin1);
  servo2.attach(servoPin2);
  servoFunnel.attach(servoFunnelPin);

  pinMode(relayPin, OUTPUT);
  pinMode(triggerPin, INPUT_PULLUP);

  closeAllServos();
  runConveyor(); 

  Serial.println("\n----- SYSTEM READY: CASHEW CLASSIFIER -----");
}

// --- HÀM ĐIỀU KHIỂN BĂNG CHUYỀN ---
void runConveyor() {
  digitalWrite(relayPin, HIGH);
  Serial.println("[ ► ] BĂNG CHUYỀN: CHẠY");
}

void stopConveyor() {
  digitalWrite(relayPin, LOW);
  Serial.println("[ █ ] BĂNG CHUYỀN: DỪNG");
}

// --- HÀM ĐIỀU KHIỂN SERVO ---
void closeAllServos() {
  servoGate.write(SERVO_CLOSED);
  servo1.write(SERVO_CLOSED);
  servo2.write(SERVO_CLOSED);
  //servoFunnel.write(SERVO_CLOSED); 
  Serial.println("[ 🔒 ] SERVO: Đã đóng tất cả");
}

// Hàm tạo lực hất hạt điều bằng cách sử dụng góc Momentum
void flickAction(Servo &s) {
  // S tạo một cú giật nhanh từ vị trí CLOSED sang MOMENTUM rồi về lại
  s.write(SERVO_MOMENTUM); 
  delay(50); 
  s.write(SERVO_CLOSED); 
  delay(100);
}

// Hàm mở đường sẵn cho hạt đi qua
void preOpenPath(int type) {
  switch (type) {
    case 2: // Loại 2: Cần đi qua Gate để đến Servo 1
      servoGate.write(SERVO_OPEN);
      break;
    case 3: // Loại 3: Cần đi qua Gate và Servo 1 để đến Servo 2
      servoGate.write(SERVO_OPEN);
      servo1.write(SERVO_OPEN);
      break;
  }
}

void controlGate(int type) {
  stopConveyor(); // Dừng để xử lý chính xác vị trí
  
  switch (type) {
    case 0: // Accuracy thấp
      Serial.println("[ ! ] Loại 0: Accuracy thấp - Không xử lý");
      break;

    case 1: // WHOLE (Nguyên) -> Rơi rổ 1 (Ngay tại Gate)
      Serial.println("[ 1 ] Loại 1: WHOLE -> Flick Gate");
      delay(DELAY_TO_GATE);
      flickAction(servoGate);
      break;

    case 2: // BROKEN (Vỡ) -> Rơi rổ 2 (Tại Servo 1)
      Serial.println("[ 2 ] Loại 2: BROKEN -> Flick Servo 1");
      preOpenPath(2); // Mở Gate cho hạt đi qua
      delay(DELAY_TO_S1);
      flickAction(servo1);
      break;

    case 3: // DEFECT (Hỏng) -> Rơi rổ 3 (Tại Servo 2)
      Serial.println("[ 3 ] Loại 3: DEFECT -> Flick Servo 2");
      preOpenPath(3); // Mở Gate và S1 cho hạt đi qua
      delay(DELAY_TO_S2);
      flickAction(servo2);
      break;

    default:
      Serial.println("[ ? ] Lệnh không hợp lệ");
      break;
  }

  delay(500); // Chờ hạt rơi hẳn
  closeAllServos();
  runConveyor();
}

void loop() {
  // 1. Kiểm tra tín hiệu phân loại từ Server (ESP32-CAM -> PC -> Arduino)
  if (Serial.available() > 0) {
    int type = Serial.parseInt();
    while(Serial.available() > 0) Serial.read(); 

    controlGate(type);
  }

  // 2. Logic cấp liệu từ phễu (Tùy chọn: Nhả hạt theo chu kỳ hoặc nút bấm)
  // Ví dụ: Mỗi 5 giây nhả 1 hạt nếu không đang trong quá trình phân loại
  /*
  static unsigned long lastDispense = 0;
  if (millis() - lastDispense > 5000) {
      servoFunnel.write(SERVO_OPEN);
      delay(200);
      servoFunnel.write(SERVO_CLOSED);
      lastDispense = millis();
  }
  */
}