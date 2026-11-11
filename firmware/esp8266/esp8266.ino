#include "secrets.h"  // copy secrets.example.h to secrets.h and fill in your values
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <PubSubClient.h>
#include <SoftwareSerial.h>
#include <Ticker.h>
#include <WiFiClient.h>
#include <time.h>

ESP8266WiFiMulti wifiMulti;
Ticker blinker;

const char *mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char *topic_dados = "solar_7016/dados";
const char *topic_comando = "solar_7016/comando";

const char *thingspeak_server = "http://api.thingspeak.com/update";
const String thingspeak_apiKey = THINGSPEAK_WRITE_KEY;

const char *ntp_server = "pool.ntp.org";
const char *TZ_INFO = "WET0WEST,M3.5.0/1,M10.5.0";

int ultimoPeriodo = -1;

#define RX_PIN 5
#define TX_PIN 4
#define LED_AMARELO 14
#define LED_WIFI 12
#define LED_TX 13

SoftwareSerial linkSerial(RX_PIN, TX_PIN);
WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastTime = 0;
const unsigned long timerDelay = 15000;

String inputString = "";
bool stringComplete = false;

void tick() {
  int state = digitalRead(LED_WIFI);
  digitalWrite(LED_WIFI, !state);
}

void verificarPeriodoNoite() {
  time_t now = time(nullptr);
  struct tm *p_tm = localtime(&now);

  if (p_tm->tm_year < (2024 - 1900))
    return;

  int hora = p_tm->tm_hour;
  int min = p_tm->tm_min;

  int periodoAtual = (hora >= 20 || hora < 6) ? 1 : 0;

  Serial.printf("[NTP] Hora: %02d:%02d | Estado: %s\n", hora, min,
                periodoAtual ? "NOITE" : "DIA");

  if (periodoAtual == 1) {
    linkSerial.print('N');
  } else {
    linkSerial.print('S');
  }

  ultimoPeriodo = periodoAtual;
}

void setup_wifi() {
  delay(10);
  pinMode(LED_WIFI, OUTPUT);

  Serial.println();
  Serial.println("[WIFI] A iniciar gestor de redes...");
  WiFi.mode(WIFI_STA);

  wifiMulti.addAP(WIFI_SSID, WIFI_PASSWORD);

  Serial.println("[WIFI] A procurar redes...");
  blinker.attach(0.5, tick);

  while (wifiMulti.run() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  blinker.detach();
  digitalWrite(LED_WIFI, HIGH);

  Serial.println("");
  Serial.printf("[WIFI] Conectado a: %s\n", WiFi.SSID().c_str());
  Serial.printf("[WIFI] IP: %s\n", WiFi.localIP().toString().c_str());

  configTime(0, 0, ntp_server);
  setenv("TZ", TZ_INFO, 1);
  tzset();
}

void callback(char *topic, byte *payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("\n[MQTT] Cmd Recebido: '%s'\n", message.c_str());

  char cmd = message[0];

  if (cmd == 'A') {
    if (ultimoPeriodo == 1) {
      Serial.println(
          "[LOGICA] Auto solicitado, mas é NOITE -> Executando Combo A+N");

      linkSerial.print('A');
      delay(50);

      linkSerial.print('N');

      return;
    }
  }

  linkSerial.print(cmd);
  digitalWrite(LED_AMARELO, HIGH);
  delay(50);
  digitalWrite(LED_AMARELO, LOW);
}

void reconnect() {
  while (!client.connected()) {
    if (wifiMulti.run() != WL_CONNECTED) {
      Serial.println("[WIFI] Perdido durante reconexão MQTT.");
      delay(1000);
      return;
    }

    Serial.print("[MQTT] A ligar ao Broker... ");
    String clientId = "ESP8266Client-" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("Conectado!");
      client.subscribe(topic_comando);

      Serial.println("[INIT] MQTT pronto. A sincronizar relógio...");
      verificarPeriodoNoite();

    } else {
      Serial.printf("Falhou (rc=%d). Tentar em 5s...\n", client.state());
      delay(5000);
    }
  }
}

void enviarThingSpeak(float temp, float hum, int solV, int solI, long solP) {
  if ((millis() - lastTime) > timerDelay) {
    if (wifiMulti.run() == WL_CONNECTED) {
      WiFiClient clientTS;
      HTTPClient http;

      String url = String(thingspeak_server) + "?api_key=" + thingspeak_apiKey +
                   "&field1=" + String(temp) + "&field2=" + String(hum) +
                   "&field3=" + String(solV) + "&field4=" + String(solI) +
                   "&field5=" + String(solP);

      http.begin(clientTS, url);
      int httpCode = http.GET();
      http.end();

      digitalWrite(LED_TX, HIGH);
      delay(100);
      digitalWrite(LED_TX, LOW);

      if (httpCode > 0) {
        Serial.printf("[TS] Dados enviados com sucesso (Code: %d)\n", httpCode);
      } else {
        Serial.printf("[TS] Erro no envio (Code: %d)\n", httpCode);
      }
    }
    lastTime = millis();
  }
}

void enviarStatusMQTT(int status_sys) {
  JsonDocument doc;

  if (status_sys == 0) {
    doc["sys"] = 0;
    doc["mod"] = 0;
  } else {
    doc["sys"] = 1;
  }

  char buffer[64];
  serializeJson(doc, buffer);
  client.publish(topic_dados, buffer);
  Serial.println("[MQTT] Status enviado (Pausa/Resume).");
}

void processarLinha(String dados) {

  if (dados.indexOf("STATUS:OFF") != -1) {
    enviarStatusMQTT(0);
    Serial.println("[ARDUINO] Sistema entrou em PAUSA.");
    return;
  }
  if (dados.indexOf("STATUS:RESUME") != -1 ||
      dados.indexOf("STATUS:START") != -1) {
    Serial.println("[ARDUINO] Sistema INICIADO/RETOMADO.");
    return;
  }

  if (dados.indexOf("T:") == -1)
    return;

  int t_d, t_f, h_d, h_f, solV, solI, modo_real;
  long solP;
  int angH, angV;
  int l[4], c[4];

  int n =
      sscanf(dados.c_str(),
             "T:%d.%d H:%d.%d S:%d:%d:%ld L:%d,%d,%d,%d LC:%d,%d,%d,%d M:%d | "
             "H:%d V:%d",
             &t_d, &t_f, &h_d, &h_f, &solV, &solI, &solP, &l[0], &l[1], &l[2],
             &l[3], &c[0], &c[1], &c[2], &c[3], &modo_real, &angH, &angV);

  if (n < 18)
    return;

  Serial.printf(
      "[DATA] T:%d.%d H:%d.%d | Sol: %dmW | Modo: %d | Ang: H%d V%d\n", t_d,
      t_f, h_d, h_f, solP, modo_real, angH, angV);

  JsonDocument doc;
  doc["sys"] = 1;
  doc["mod"] = modo_real;

  char bufT[8], bufH[8];
  sprintf(bufT, "%d.%d", t_d, t_f);
  sprintf(bufH, "%d.%d", h_d, h_f);
  doc["t"] = bufT;
  doc["h"] = bufH;

  doc["sol_v"] = solV;
  doc["sol_i"] = solI;
  doc["sol_p"] = solP;

  JsonArray ang = doc["ang"].to<JsonArray>();
  ang.add(angH);
  ang.add(angV);

  JsonArray cal = doc["cal"].to<JsonArray>();
  for (int i = 0; i < 4; i++)
    cal.add(c[i]);

  JsonArray raw = doc["raw"].to<JsonArray>();
  for (int i = 0; i < 4; i++)
    raw.add(l[i]);

  char buffer[512];
  serializeJson(doc, buffer);

  client.publish(topic_dados, buffer);

  float tempVal = t_d + (t_f / 10.0);
  float humVal = h_d + (h_f / 10.0);
  enviarThingSpeak(tempVal, humVal, solV, solI, solP);
}

void setup() {
  Serial.begin(115200);

  linkSerial.begin(9600);

  pinMode(LED_WIFI, OUTPUT);
  pinMode(LED_TX, OUTPUT);
  pinMode(LED_AMARELO, OUTPUT);
  digitalWrite(LED_TX, LOW);
  digitalWrite(LED_AMARELO, LOW);

  Serial.println("\n\n=== ESP8266 GATEWAY V2.3 (DEBUG MELHORADO) ===");

  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {

  if (wifiMulti.run() != WL_CONNECTED) {
    Serial.println("[LOOP] WiFi perdido. A tentar religar...");
    delay(1000);
  } else {
    if (!client.connected())
      reconnect();
    client.loop();

    static unsigned long ultimaVerificacaoHora = 0;
    if (millis() - ultimaVerificacaoHora > 60000) {
      verificarPeriodoNoite();
      ultimaVerificacaoHora = millis();
    }
  }

  while (linkSerial.available()) {
    char inChar = (char)linkSerial.read();
    if (inChar == '\n') {
      processarLinha(inputString);
      inputString = "";
    } else {
      inputString += inChar;
    }
  }
}