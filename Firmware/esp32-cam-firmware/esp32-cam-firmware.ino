#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "esp_http_server.h"
#include <ArduinoJson.h>  // Thêm thư viện ArduinoJson (cài qua Library Manager)

// =============================================================================
// PIN MAPPING  (AI Thinker ESP32-CAM)
// Serial1: RX=GPIO15, TX=GPIO14  ←→  Arduino: TX=pin11, RX=pin10
// =============================================================================
#define RX_PIN  15
#define TX_PIN  14

#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22
#define FLASH_GPIO_NUM   4

// =============================================================================
// CẤU HÌNH MẠNG & SERVER
// =============================================================================
const char* WIFI_SSID      = "YDraGN";
const char* WIFI_PASSWORD  = "khongthichcho";
const char* SERVER_URL     = "http://172.20.10.3:5000/upload";
const int   HTTP_TIMEOUT_MS = 6000;

// Ngưỡng accuracy để chấp nhận kết quả AI
const float ACCURACY_THRESHOLD = 0.8;

// =============================================================================
// BIẾN TOÀN CỤC
// =============================================================================
httpd_handle_t stream_httpd = NULL;
int countCmd     = 0;
int countCapture = 0;

// =============================================================================
// STREAM HANDLER  (port 81 /stream)
// =============================================================================
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb  = NULL;
  esp_err_t    res = ESP_OK;
  char part_buf[64];

  res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=123456789000000000000987654321");
  if (res != ESP_OK) return res;

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("⚠️ Stream: camera capture failed");
      res = ESP_FAIL;
    } else {
      size_t hlen = snprintf(part_buf, sizeof(part_buf),
        "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
      if (res == ESP_OK)
        res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      if (res == ESP_OK)
        res = httpd_resp_send_chunk(req, "\r\n--123456789000000000000987654321\r\n", 36);
      esp_camera_fb_return(fb);
    }
    if (res != ESP_OK) break;
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;

  httpd_uri_t stream_uri = {
    .uri      = "/stream",
    .method   = HTTP_GET,
    .handler  = stream_handler,
    .user_ctx = NULL
  };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.printf("🎥 Stream: http://%s:81/stream\n", WiFi.localIP().toString().c_str());
  }
}

// =============================================================================
// SETUP CAMERA
// =============================================================================
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk      = XCLK_GPIO_NUM;
  config.pin_pclk      = PCLK_GPIO_NUM;
  config.pin_vsync     = VSYNC_GPIO_NUM;
  config.pin_href      = HREF_GPIO_NUM;
  config.pin_sscb_sda  = SIOD_GPIO_NUM;
  config.pin_sscb_scl  = SIOC_GPIO_NUM;
  config.pin_pwdn      = PWDN_GPIO_NUM;
  config.pin_reset     = RESET_GPIO_NUM;
  config.xclk_freq_hz  = 20000000;
  config.pixel_format  = PIXFORMAT_JPEG;
  config.frame_size    = FRAMESIZE_SVGA;
  config.jpeg_quality  = 10;
  config.fb_count      = 1;

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("❌ Camera init failed!");
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  s->set_exposure_ctrl(s, 0);
  s->set_aec2(s, 0);
  s->set_gain_ctrl(s, 0);
  s->set_aec_value(s, 500);
  s->set_agc_gain(s, 5);
  s->set_denoise(s, 0);
  s->set_raw_gma(s, 0);
  s->set_contrast(s, 1);
  s->set_brightness(s, 1);
  s->set_sharpness(s, 2);
  s->set_saturation(s, 0);
  s->set_whitebal(s, 1);
  s->set_wb_mode(s, 1);
  s->set_vflip(s, 1);

  return true;
}

// =============================================================================
// ĐIỀU KHIỂN FLASH
// =============================================================================
void setFlash(int value) {
  value = constrain(value, 0, 255);
  ledcWrite(FLASH_GPIO_NUM, value);
  Serial.printf("💡 Flash: %d\n", value);
}

// =============================================================================
// PARSE JSON + LỌC ACCURACY → GỬI LỆNH VỀ ARDUINO
// Server trả về: {"c":1,"f":0.95}
//   c = class (1=whole, 2=broken, 3=defect)
//   f = confidence/accuracy
//
// Logic gửi về Arduino:
//   0  → accuracy < threshold (không chắc, giữ đóng cửa)
//   1  → whole  (chỉ mở servoGate)
//   2  → broken (mở servoGate + servo1)
//   3  → defect (mở tất cả servo)
// =============================================================================
void parseAndSendResult(const String &json) {
  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, json);

  if (err) {
    Serial.printf("❌ JSON parse error: %s\n", err.c_str());
    Serial.printf("   Raw: %s\n", json.c_str());
    // Gửi lệnh 0 (không rõ kết quả → giữ đóng)
    sendResultToArduino("0");
    return;
  }

  int   classId  = doc["c"] | 0;
  float conf     = doc["f"] | 0.0f;

  Serial.printf("📊 Class=%d  Conf=%.2f  Threshold=%.2f\n", classId, conf, ACCURACY_THRESHOLD);

  if (conf < ACCURACY_THRESHOLD) {
    Serial.println("⚠️ Confidence thấp → Gửi lệnh 0 (giữ đóng)");
    sendResultToArduino("0");
  } else {
    String cmd = String(classId);
    Serial.printf("✅ Gửi lệnh %s về Arduino\n", cmd.c_str());
    sendResultToArduino(cmd);
  }
}

// =============================================================================
// CHỤP ẢNH + HTTP POST → nhận kết quả AI → parse → trả về Arduino
// =============================================================================
void processCaptureAndPost(int flashValue) {
  countCapture++;
  Serial.printf("\n--- Capture #%d (flash=%d) ---\n", countCapture, flashValue);

  setFlash(flashValue);
  //delay(10); // Chờ flash ổn định

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("❌ Capture thất bại");
    sendResultToArduino("0"); // Báo lỗi → giữ đóng
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "image/jpeg");

  int httpCode = http.POST(fb->buf, fb->len);
  esp_camera_fb_return(fb);

  if (httpCode == HTTP_CODE_OK) {
    String result = http.getString();
    result.trim();
    Serial.printf("📥 Server response: %s\n", result.c_str());
    parseAndSendResult(result);
  } else if (httpCode < 0) {
    Serial.printf("❌ HTTP Error: %s\n", http.errorToString(httpCode).c_str());
    sendResultToArduino("0");
  } else {
    Serial.printf("⚠️ Server HTTP %d\n", httpCode);
    sendResultToArduino("0");
  }

  http.end();
}

// =============================================================================
// GỬI KẾT QUẢ VỀ ARDUINO QUA Serial1
// =============================================================================
void sendResultToArduino(const String &result) {
  countCmd++;
  Serial.printf("%d. → Arduino: \"%s\"\n", countCmd, result.c_str());
  Serial1.println(result);
}

// =============================================================================
// NHẬN LỆNH TỪ ARDUINO QUA Serial1
// Format: "1-{flashValue}\n"  →  chụp ảnh
// =============================================================================
void syncWithArduino() {
  if (!Serial1.available()) return;

  String cmd = Serial1.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd[0] == '1') {
    int flashValue = 20; // Default
    int dashIdx = cmd.indexOf('-');
    if (dashIdx != -1) {
      flashValue = cmd.substring(dashIdx + 1).toInt();
      flashValue = constrain(flashValue, 0, 255);
    }
    processCaptureAndPost(flashValue);
  } else {
    Serial.printf("⚠️ Lệnh không rõ từ Arduino: \"%s\"\n", cmd.c_str());
  }
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
  Serial.begin(115200);
  Serial1.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  delay(500);

  Serial.println("\n===== ESP32-CAM CASHEW CLASSIFIER =====");

  ledcAttach(FLASH_GPIO_NUM, 5000, 8);
  setFlash(30);

  if (!initCamera()) {
    Serial.println("Dừng — lỗi camera.");
    return;
  }
  Serial.println("✅ Camera OK");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Đang kết nối WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n✅ WiFi: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("📡 Upload: %s\n", SERVER_URL);
  Serial.printf("🎯 Accuracy threshold: %.2f\n", ACCURACY_THRESHOLD);

  startCameraServer();
  Serial.println("========================================\n");
}

// =============================================================================
// LOOP
// =============================================================================
void loop() {
  syncWithArduino();
  delay(10);
}
