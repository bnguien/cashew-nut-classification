#include <Servo.h>
#include <SoftwareSerial.h>

//RX = 10
//TX = 11
SoftwareSerial mySerial(10, 11);

Servo servo1;
Servo servo2;

#define servoPin1 6
#define servoPin2 7
#define funnelPin 8
#define irPin 9

int currentFlashValue = 20;
int count = 0;

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);

  servo1.attach(servoPin1);
  servo1.write(135);

  servo2.attach(servoPin2);
  servo2.write(135);

  pinMode(irPin, INPUT_PULLUP);

  delay(1000);
  Serial.println("----- TESTING ESP32-CAM & ARDUINO -----");
  Serial.println("Arduino ready! Gõ số để thay đổi giá trị flash!\n");
}

int count = 0;
void loop() {
  // --- PHẦN 0: NHẬN GIÁ TRỊ FLASH TỪ PC (KHÔNG CHẶN LUỒNG) ---
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() > 0) {
      currentFlashValue = input.toInt();
      Serial.print("💡 Đã thay đổi Flash Value: ");
      Serial.println(currentFlashValue);
    }
  }

  // --- PHẦN 1: GỬI LỆNH CHỤP ESP32 --- 
  if (digitalRead(irPin) == LOW) {
    Serial.println("✅ Phát hiện hạt: --> Yêu cầu ESP32 chụp ảnh ...");
    String cmd = "1-" + String(currentFlashValue);
    mySerial.println(cmd);
    delay(800);
  }

  // --- PHẦN 2: NHẬN KẾT QUẢ AI VÀ ĐIỀU KHIỂN SERVO ---
  if (mySerial.available() > 0) {
    String data = mySerial.readStringUntil('\n');
    data.trim();

    if(data.length() > 0) {
      int command = data.toInt();
      count++;
      Serial.print("[STT: "); Serial.print(count);
      Serial.print("] AI phân loại: "); Serial.println(command);

      switch(command) {
        case 1:
          Serial.println("===> Hạt Nguyên (Whole): Servo 1 gạt.");
          servo1.write(180);
          delay(800);
          servo1.write(135);
          break;
        case 2:
          Serial.println("===> Hạt Vỡ (Broken): Servo 2 gạt.");
          servo2.write(180);
          delay(1000);
          servo2.write(135);
          break;
        case 3:
          Serial.println("===> Hạt Hỏng (Defect): Gạt cả 2 Servo.");
          servo1.write(180);
          delay(300);
          servo1.write(135);

          servo2.write(180);
          delay(300);
          servo2.write(135);
          break;
        default:
          Serial.println("⚠️ ===> Lệnh KHÔNG hợp lệ!");
          servo1.write(0);
      }
    }
  }

  delay(10);
}
