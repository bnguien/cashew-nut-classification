#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "esp_http_server.h"
#include <stdarg.h>
#include <stdio.h>

#ifndef DEBUG_ARDUINO_SERIAL1
#define DEBUG_ARDUINO_SERIAL1 1
#endif
#ifndef DEBUG_LOG_HTTP_BODY
#define DEBUG_LOG_HTTP_BODY 1
#endif
#ifndef DEBUG_LOG_MQTT_PAYLOAD
#define DEBUG_LOG_MQTT_PAYLOAD 1
#endif

static void logLine(const char* tag, const char* fmt, ...) {
  char buf[256];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  Serial.printf("[%10lu][%-10s] %s\n", millis(), tag, buf);
}

// =============================================================================
// Serial1: RX=GPIO15, TX=GPIO14  <-> Arduino: TX=pin11, RX=pin10
//=============================================================================
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
// WIFI + HTTP SERVER (Django)
// =============================================================================
const char* WIFI_SSID = "bn";
const char* WIFI_PASSWORD = "7139171000";

const char* SERVER_HOST = "172.20.10.2";
const uint16_t SERVER_PORT = 5000;
const char* SERVER_PATH = "/upload";
const char* ESP_API_KEY = "";
const uint32_t HTTP_TIMEOUT_MS = 5000;

// =============================================================================
// MQTT
// =============================================================================
const char* MQTT_HOST = "172.20.10.2";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "";
const char* MQTT_PASSWORD = "";

const char* TOPIC_COMMAND = "conveyor/command";
const char* TOPIC_SERVO = "conveyor/servo";
const char* TOPIC_STATUS = "conveyor/status";
const char* TOPIC_HEARTBEAT = "conveyor/heartbeat";

const uint32_t HEARTBEAT_INTERVAL_MS = 3000;

// =============================================================================
// GLOBALS
// =============================================================================
httpd_handle_t stream_httpd = NULL;
WiFiClient mqttNetClient;
PubSubClient mqttClient(mqttNetClient);

bool runEnabled = true;
int countCmd = 0;
int countCapture = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastWifiLostLogMs = 0;
unsigned long lastMqttLostLogMs = 0;
String espDeviceId;

// =============================================================================
// HELPERS
// =============================================================================
void logHexPreview(const char* tag, const uint8_t* data, size_t len, size_t maxShow) {
  Serial.printf("[%10lu][%-10s] HEX preview (len=%u, show=%u): ", millis(), tag, (unsigned)len, (unsigned)maxShow);
  size_t n = (len < maxShow) ? len : maxShow;
  for (size_t i = 0; i < n; i++) Serial.printf("%02X ", data[i]);
  if (len > maxShow) Serial.print("...");
  Serial.println();
}

void sendResultToArduino(const String& result) {
  countCmd++;
  int val = result.toInt();
  int chk = (val + 42) % 10;
  String packet = result + "," + String(chk);
  logLine("ARD_TX", "cmd#%d -> \"%s\"", countCmd, packet.c_str());
  Serial1.println(packet);
  Serial1.flush();
}

void publishStatus(const char* severity, bool isFault, const String& message) {
  if (!mqttClient.connected()) {
    logLine("MQTT", "publishStatus skipped (not connected)");
    return;
  }
  StaticJsonDocument<256> doc;
  doc["device_id"] = espDeviceId;
  doc["severity"] = severity;
  doc["is_fault"] = isFault;
  doc["message"] = message;
  doc["ts_ms"] = millis();
  char out[256];
  size_t n = serializeJson(doc, out, sizeof(out));
  bool ok = mqttClient.publish(TOPIC_STATUS, (const uint8_t*)out, n, false);
  logLine("MQTT", "publish %s ok=%d bytes=%u msg=%s", TOPIC_STATUS, ok ? 1 : 0, (unsigned)n, message.c_str());
}

void publishHeartbeat() {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<192> hb;
  hb["device_id"] = espDeviceId;
  hb["uptime_ms"] = millis();
  hb["rssi_dbm"] = WiFi.RSSI();
  hb["is_running"] = runEnabled;
  char out[192];
  size_t n = serializeJson(hb, out, sizeof(out));
  mqttClient.publish(TOPIC_HEARTBEAT, (const uint8_t*)out, n, false);
  logLine("HB", "heartbeat published bytes=%u rssi=%d run=%d", (unsigned)n, WiFi.RSSI(), runEnabled ? 1 : 0);
}

void setFlash(int value) {
  value = constrain(value, 0, 255);
  ledcWrite(FLASH_GPIO_NUM, value);
  logLine("FLASH", "PWM=%d", value);
}

// =============================================================================
// STREAM
// =============================================================================
static esp_err_t stream_handler(httpd_req_t* req) {
  camera_fb_t* fb = NULL;
  esp_err_t res = ESP_OK;
  char part_buf[64];
  res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=123456789000000000000987654321");
  if (res != ESP_OK) return res;
  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      logLine("STREAM", "fb_get failed");
      res = ESP_FAIL;
    } else {
      size_t hlen = snprintf(part_buf, sizeof(part_buf),
                             "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, "\r\n--123456789000000000000987654321\r\n", 36);
      esp_camera_fb_return(fb);
    }
    if (res != ESP_OK) break;
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;
  httpd_uri_t stream_uri = {.uri = "/stream", .method = HTTP_GET, .handler = stream_handler, .user_ctx = NULL};
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    logLine("HTTPD", "stream http://%s:81/stream", WiFi.localIP().toString().c_str());
  } else {
    logLine("HTTPD", "start failed");
  }
}

bool initCamera() {
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
  if (esp_camera_init(&config) != ESP_OK) {
    logLine("CAM", "init FAILED");
    return false;
  }
  sensor_t* s = esp_camera_sensor_get();
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
  logLine("CAM", "init OK");
  return true;
}

bool postImageMultipart(camera_fb_t* fb, String& responseBody, int& httpCode) {
  WiFiClient client;
  client.setTimeout(HTTP_TIMEOUT_MS);

  logLine("HTTP", "connect %s:%u ...", SERVER_HOST, SERVER_PORT);
  if (!client.connect(SERVER_HOST, SERVER_PORT)) {
    logLine("HTTP", "TCP connect FAILED");
    return false;
  }
  logLine("HTTP", "TCP connected");

  const String boundary = "----CashewBoundary7MA4YWxkTrZu0gW";
  String head = "--" + boundary + "\r\n";
  head += "Content-Disposition: form-data; name=\"image\"; filename=\"capture.jpg\"\r\n";
  head += "Content-Type: image/jpeg\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";
  const size_t totalLen = head.length() + fb->len + tail.length();

  client.printf("POST %s HTTP/1.1\r\n", SERVER_PATH);
  client.printf("Host: %s:%u\r\n", SERVER_HOST, SERVER_PORT);
  client.println("Connection: close");
  client.printf("Content-Type: multipart/form-data; boundary=%s\r\n", boundary.c_str());
  client.printf("Content-Length: %u\r\n\r\n", totalLen);

  client.print(head);
  // Gửi ảnh theo chunk lớn hơn (2048) để nhanh hơn nếu mạng ổn định
  size_t sent = 0;
  while (sent < fb->len) {
    size_t chunk = min((size_t)4096, fb->len - sent);
    client.write(fb->buf + sent, chunk);
    sent += chunk;
  }
  client.print(tail);
  client.flush();

  unsigned long start = millis();
  while (client.connected() && !client.available()) {
    if (millis() - start > HTTP_TIMEOUT_MS) {
      logLine("HTTP", "response TIMEOUT");
      client.stop();
      return false;
    }
    delay(1);
  }

  String statusLine = client.readStringUntil('\n');
  if (statusLine.startsWith("HTTP/1.1 ")) {
    httpCode = statusLine.substring(9, 12).toInt();
  }

  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() <= 1) break;
  }

  responseBody = "";
  unsigned long bodyStart = millis();
  
  while (client.connected() || client.available()) {
    if (client.available()) {
      char c = client.read();
      responseBody += c;
      if (c == '}') break; 
    }
    if (millis() - bodyStart > 2000) break; 
  }
  client.stop();

  logLine("HTTP", "Done! Body received in %lu ms", millis() - bodyStart);
  return true;
}

void parseAndSendResult(const String& json) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    logLine("JSON", "parse ERR: %s", err.c_str());
    sendResultToArduino("0");
    return;
  }
  bool ok = doc["ok"] | false;
  int c = doc["c"] | 0;
  float f = doc["f"] | 0.0f;
  logLine("JSON", "ok=%d c=%d f=%.4f (from HTTP)", ok ? 1 : 0, c, f);
  if (!ok || f < 0.25f) {
    logLine("JSON", "confidence too low (f=%.4f) -> reject", f);
    sendResultToArduino("0");
    return;
  }
  c = constrain(c, 0, 3);
  sendResultToArduino(String(c));
}

void processCaptureAndPost(int flashValue) {
  if (!runEnabled) {
    logLine("CAPTURE", "skipped runEnabled=false");
    return;
  }
  countCapture++;
  logLine("CAPTURE", "----- #%d flash=%d -----", countCapture, flashValue);
  setFlash(flashValue);
  delay(30);

  camera_fb_t* fb_flush = esp_camera_fb_get();
  if (fb_flush) esp_camera_fb_return(fb_flush);

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    logLine("CAPTURE", "fb_get FAILED");
    sendResultToArduino("0");
    publishStatus("error", true, "camera fb_get failed");
    return;
  }
  logLine("CAPTURE", "JPEG len=%u", (unsigned)fb->len);

  String body;
  int httpCode = 0;
  bool posted = postImageMultipart(fb, body, httpCode);
  esp_camera_fb_return(fb);

  if (!posted) {
    logLine("CAPTURE", "post FAILED (network)");
    sendResultToArduino("0");
    publishStatus("error", true, "upload connect/timeout");
  } else if (httpCode == 200) {
    body.trim();
    parseAndSendResult(body);
  } else {
    logLine("CAPTURE", "HTTP fail code=%d", httpCode);
    sendResultToArduino("0");
    publishStatus("warning", true, String("http=") + httpCode);
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  msg.reserve(length);
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  logLine("MQTT_RX", "topic=%s len=%u", topic, length);
#if DEBUG_LOG_MQTT_PAYLOAD
  if (length > 0) logHexPreview("MQTT_RX", payload, length, 48);
  {
    size_t show = msg.length() > 200 ? 200 : msg.length();
    Serial.printf("[%10lu][%-10s] text: ", millis(), "MQTT_RX");
    Serial.write((const uint8_t*)msg.c_str(), show);
    if (msg.length() > 200) Serial.print("...");
    Serial.println();
  }
#endif
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    logLine("MQTT_RX", "JSON err: %s", err.c_str());
    return;
  }
  String t = String(topic);
  if (t == TOPIC_COMMAND) {
    String cmd = doc["command"] | "";
    cmd.toLowerCase();
    logLine("CMD", "command=%s", cmd.c_str());
    if (cmd == "start") {
      runEnabled = true;
      Serial1.println("RELAY:RUN");
      publishStatus("info", false, "mqtt start");
    } else if (cmd == "stop") {
      runEnabled = false;
      Serial1.println("RELAY:STOP");
      publishStatus("info", false, "mqtt stop");
    }
    return;
  }
  if (t == TOPIC_SERVO) {
    int c = doc["c"] | 0;
    float f = doc["f"] | 0.0f;
    c = constrain(c, 0, 3);
    logLine("SERVO", "MQTT c=%d f=%.4f -> forward to Arduino", c, f);
    sendResultToArduino(String(c));
    return;
  }
}

void ensureMqttConnected() {
  if (mqttClient.connected()) return;
  logLine("MQTT", "reconnecting...");
  while (!mqttClient.connected()) {
    String cid = "esp32cam-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF), HEX);
    bool ok;
    if (strlen(MQTT_USER) > 0) ok = mqttClient.connect(cid.c_str(), MQTT_USER, MQTT_PASSWORD);
    else ok = mqttClient.connect(cid.c_str());
    if (ok) {
      logLine("MQTT", "connected clientId=%s", cid.c_str());
      if (mqttClient.subscribe(TOPIC_COMMAND, 1)) logLine("MQTT", "sub OK %s", TOPIC_COMMAND);
      else logLine("MQTT", "sub FAIL %s", TOPIC_COMMAND);
      if (mqttClient.subscribe(TOPIC_SERVO, 1)) logLine("MQTT", "sub OK %s", TOPIC_SERVO);
      else logLine("MQTT", "sub FAIL %s", TOPIC_SERVO);
      publishStatus("info", false, "mqtt connected");
    } else {
      int st = mqttClient.state();
      logLine("MQTT", "connect FAIL state=%d (see PubSubClient state codes)", st);
      delay(2000);
    }
  }
}

void syncWithArduino() {
  if (!Serial1.available()) return;
  String cmd = Serial1.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;
  
  
  logLine("ARD_RX", "len=%d text=\"%s\"", cmd.length(), cmd.c_str());
  
  if (cmd.startsWith("SYS:")) {
    String sysCmd = cmd.substring(4);
    if (sysCmd == "ON") {
      runEnabled = true;
      logLine("SYS", "System STARTED by button");
      publishStatus("info", false, "system_start_button");
    } else if (sysCmd == "OFF") {
      runEnabled = false;
      logLine("SYS", "System STOPPED by button");
      publishStatus("warning", false, "system_stop_button");
    }
    return;
  }
  
  if (cmd[0] == '1') {
    int flashValue = 25;
    int dashIdx = cmd.indexOf('-');
    if (dashIdx != -1) {
      flashValue = cmd.substring(dashIdx + 1).toInt();
      flashValue = constrain(flashValue, 0, 255);
    }
    logLine("ARD_RX", "trigger CAPTURE flash=%d", flashValue);
    
    processCaptureAndPost(flashValue);
  } else {
    logLine("ARD_RX", "unknown command: %s", cmd.c_str());
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(100);

  // Scan networks
  logLine("WIFI", "Scanning networks...");
  int n = WiFi.scanNetworks();
  logLine("WIFI", "Found %d networks:", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  [%d] %s (RSSI:%d)\n", i, WiFi.SSID(i).c_str(), WiFi.RSSI(i));
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  logLine("WIFI", "connecting SSID=%s ...", WIFI_SSID);
  
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  Serial.println();
  logLine("WIFI", "status=%d", WiFi.status());
  
  if (WiFi.status() != WL_CONNECTED) {
    logLine("WIFI", "FAILED!");
    return;
  }
  logLine("WIFI", "OK ip=%s rssi=%d", WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  logLine("BOOT", "ESP32-CAM Cashew firmware (debug logs ON)");

  Serial1.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  logLine("ARD", "Serial1 9600 8N1 RX=%d TX=%d", RX_PIN, TX_PIN);

  espDeviceId = "esp32cam-" + String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF), HEX);
  logLine("BOOT", "device_id=%s", espDeviceId.c_str());

  ledcAttach(FLASH_GPIO_NUM, 5000, 8);
  setFlash(30);

  if (!initCamera()) {
    logLine("BOOT", "HALT: camera");
    return;
  }
  connectWiFi();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  ensureMqttConnected();

  WiFi.setSleep(false);

  logLine("CFG", "POST http://%s:%u%s", SERVER_HOST, SERVER_PORT, SERVER_PATH);
  logLine("CFG", "MQTT %s:%u topics cmd=%s servo=%s", MQTT_HOST, MQTT_PORT, TOPIC_COMMAND, TOPIC_SERVO);
  logLine("BOOT", "setup done");

  delay(2000);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiLostLogMs > 3000) {
      lastWifiLostLogMs = millis();
      logLine("WIFI", "lost -> reconnect");
    }
    connectWiFi();
  }
  static unsigned long lastMqttTry = 0;
  if (!mqttClient.connected()) {
    if (millis() - lastMqttLostLogMs > 3000) {
      lastMqttLostLogMs = millis();
      logLine("MQTT", "disconnected -> reconnect");
    }
    ensureMqttConnected();
  }
  mqttClient.loop();

  if (millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = millis();
    publishHeartbeat();
  }
  syncWithArduino();
  delay(10);
}