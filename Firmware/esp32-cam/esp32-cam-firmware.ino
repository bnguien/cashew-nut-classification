#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "esp_http_server.h"

#define rxPin 15
#define txPin 14

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define FLASH_GPIO_NUM     4

const char* ssid = "YDraGN";
const char* password = "khongthichcho";
String serverUrl = "http://192.168.1.15:5000/upload"; 

unsigned long lastCaptureTime = 0;
const int timerInterval = 3000; 

const int pwmFreq = 5000;      
const int pwmResolution = 8;   
int currentBrightness = 0;

int countCmd = 0;
int countCapture = 0;

void setup() {
  Serial.begin(115200);
  Serial1.begin(9600, SERIAL_8N1, rxPin, txPin);

  delay(1000);
  Serial.println("\n----- PROCESS ESP32-CAM BLOCK -----");
  Serial.println("=== ESP32-CAM ready! ===\n");

  //Cấu hình camera
  ledcAttach(FLASH_GPIO_NUM, pwmFreq, pwmResolution);
  ledcWrite(FLASH_GPIO_NUM, 20);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  config.frame_size = FRAMESIZE_SVGA; 
  config.jpeg_quality = 10;
  config.fb_count = 1;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x", err);
    return;
  }

  sensor_t * s = esp_camera_sensor_get();

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

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n=== ✅ WIFI Connected! ===");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  startCameraServer();
}

httpd_handle_t stream_httpd = NULL;
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  char * part_buf[64];

  res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=123456789000000000000987654321");
  if(res != ESP_OK) return res;

  while(true) {
    fb = esp_camera_fb_get();
    if(!fb) {
      Serial.println("Camera capture failed");
      res = ESP_FAIL;
    } else {
      size_t hlen = snprintf((char *)part_buf, 64, "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
      if(res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      if(res == ESP_OK) res = httpd_resp_send_chunk(req, "\r\n--123456789000000000000987654321\r\n", 35);
      esp_camera_fb_return(fb);
    }
    if(res != ESP_OK) break;
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81; // Port cho Stream

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };
  
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("🎥 Stream ready at: http://<IP>:81/stream");
  }
}

void processCaptureAndPost() {
  camera_fb_t * fb = esp_camera_fb_get();
  if(!fb) {
    Serial.println("❌ Capture failed");
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "image/jpeg");
  
  int httpResponseCode = http.POST(fb->buf, fb->len);
  if (httpResponseCode > 0) {
    String response = http.getString();
    response.trim();
    Serial.printf("✅ AI Result: %s\n", response.c_str());

    sendResultToActuator(response);
  } else {
    Serial.printf("❌ POST Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
  esp_camera_fb_return(fb);
}

void changeFlashValue(int flashValue) {
  ledcWrite(FLASH_GPIO_NUM, flashValue);
  Serial.printf("💡 Flash set to: %d\n", flashValue);
}

void syncWithArduino() {
  if (Serial1.available() > 0) {
    String triggerCmd = Serial1.readStringUntil('\n');
    triggerCmd.trim();

    if (triggerCmd.length() > 0) {
      if (triggerCmd[0] == '1') {
        ++countCapture;
        Serial.printf("\n--- Nhận lệnh chụp ảnh từ Arduino lần %d ---", countCapture);

        int dashIndex = triggerCmd.indexOf('-');
        if (dashIndex != -1) {
          int flashValue = triggerCmd.substring(dashIndex + 1).toInt();
          changeFlashValue(flashValue);
        }

        processCaptureAndPost();
      }
    }
  }
}

void sendResultToActuator(String cmdResult) {
  ++countCmd;
  Serial.print(countCmd);
  Serial.print(". Gửi lệnh - ");
  Serial.println(cmdResult);

  Serial1.println(cmdResult);
  while (Serial.available() > 0) {
    Serial.read();
  }

  Serial.println("===> Gửi lệnh sang Arduino thành công!");
}

void controlSystem(int sign) {
  Serial.print("--- Nhận tín hiệu từ server: ");
  Serial.print(sign);
  Serial.println(" ---");

  if (!sign) {
    Serial.println("❌❌❌ Dừng hệ thống KHẨN CẤP! ❌❌❌");
  } 
  Serial1.print(sign);
}

void loop() {
  syncWithArduino();
  delay(10);
}
