# Architecture and flowcharts

Mermaid diagrams of the system (rendered by GitHub). Labels are in Portuguese, as in the original project.

## 1. Arquitetura Global

```mermaid
flowchart TB
subgraph Environment["AMBIENTE & ENERGIA"]
      SOL(("Sol"))
      PV_DUMMY["Painel Solar<br>"]
end
subgraph Embedded_System["HARDWARE"]
direction TB
      LDRs["4x LDRs<br>(Sensores Luz)"]
      INA["INA219<br>(Sensor I2C)"]
      DHT["DHT22<br>(Temp/Hum)"]
      ATMEGA{"ATmega328P<br>(Cérebro do sistema)"}
      BTN["Botão Físico<br>"]
      LED["LED Status"]
      SERVOS["Servos Pan/Tilt<br>(PWM Timer1)"]
      HC05["Módulo Bluetooth<br>(V1 / Legacy)"]
      ESP["ESP8266<br>(V2 / Gateway)"]
end
subgraph Network["REDE & NUVEM"]
      NTP("Servidor NTP<br>(Hora Certa)")
      MQTT("Broker HiveMQ")
      TS("ThingSpeak API")
end
subgraph Interfaces["­­­­­­­­INTERFACE DO UTILIZADOR"]
      WEB["Web Dashboard<br>"]
      PY_APP["App Python<br>"]
end
SOL -. Luz Incidente .-> LDRs
SOL -. Energia .-> PV_DUMMY
PV_DUMMY --> INA
LDRs -- Analog (ADC) --> ATMEGA
INA -- I2C (TWI) --> ATMEGA
DHT -- "1-Wire (Timer2)" --> ATMEGA
BTN -- Interrupção --> ATMEGA
ATMEGA -- Fast PWM (50Hz) --> SERVOS
ATMEGA -- Digital --> LED
ATMEGA -. UART (Alternativo) .- HC05
HC05 -. Bluetooth .-> PY_APP
ATMEGA -- UART (String Formatada)<br> --> ESP
ESP <-- JSON (PubSub) --> MQTT
ESP -- HTTP GET --> TS
ESP <-- UDP ---> NTP
MQTT <-- WebSockets (Tempo Real) ---> WEB
TS <-- HTTP GET (Histórico) ---> WEB

SOL:::env
PV_DUMMY:::env
LDRs:::sensor
INA:::sensor
DHT:::sensor
ATMEGA:::mcu
BTN:::hmi
LED:::hmi
SERVOS:::actuator
HC05:::comm
ESP:::comm
NTP:::cloud
MQTT:::cloud
TS:::cloud
WEB:::apps
PY_APP:::apps
classDef env fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:black
classDef sensor fill:#e1f5fe,stroke:#0288d1,stroke-width:1px,color:black
classDef mcu fill:#bbdefb,stroke:#1565c0,stroke-width:3px,color:black,font-weight:bold
classDef actuator fill:#ffecb3,stroke:#ff8f00,stroke-width:2px,color:black
classDef comm fill:#d1c4e9,stroke:#512da8,stroke-width:2px,color:black
classDef cloud fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px,color:black
classDef apps fill:#f8bbd0,stroke:#c2185b,stroke-width:2px,color:black
classDef hmi fill:#ffccbc,stroke:#d84315,stroke-width:1px,color:black
```

## 2. Fluxograma Main-Loop

```mermaid
flowchart TB
  Start(("Start")) --> Setup["Init HW & WDT<br>Centrar Servos"]
  Setup --> Loop(("Loop"))

Loop --> WDT["WDT Reset<br>Get Millis"]

%% LED Heartbeat
WDT --> T_Led{"Timer LED<br>> 500ms?"}
T_Led -- Sim --> Act_Led["Toggle LED"]
T_Led -- Não --> T_Btn

%% Botão Pause
Act_Led --> T_Btn
T_Btn{"Btn Press?<br>(Debounce)"}
T_Btn -- Sim --> Act_Btn["Toggle<br>PAUSE/RESUME"]
T_Btn -- Não --> Act_Sens

%% Sensores LDR (Polling interno)
Act_Btn --> Act_Sens
Act_Sens["Tarefa LDR<br>(ADC)"] --> T_Servo

%% Servos / FSM
T_Servo{"Timer Servo<br>> 50ms?"}
T_Servo -- Sim --> Act_FSM["Máquina Estados<br>Atuação"]
T_Servo -- Não --> T_DHT_Start

%% DHT Lógica Dupla
Act_FSM --> T_DHT_Start
T_DHT_Start{"Timer DHT<br>> 3s?"}
T_DHT_Start -- Sim --> Act_DHT_Req["Pedir Leitura"]
T_DHT_Start -- Não --> Act_DHT_Mgr
Act_DHT_Req --> Act_DHT_Mgr
Act_DHT_Mgr["Gerir Estados<br>DHT (Poll)"] --> T_Comms

%% Comunicação
T_Comms{"Novos Dados<br>DHT?"}
T_Comms -- Sim --> Act_INA["Ler INA219"]
Act_INA --> Act_TX["Format String<br>& UART TX"]
Act_TX --> Loop
T_Comms -- Não --> Loop

%% Estilos
classDef mcu fill:#bbdefb,stroke:#1565c0,stroke-width:2px,color:black
classDef sensor fill:#e1f5fe,stroke:#0288d1,stroke-width:1px,color:black
classDef actuator fill:#ffecb3,stroke:#ff8f00,stroke-width:2px,color:black
classDef comm fill:#d1c4e9,stroke:#512da8,stroke-width:2px,color:black
classDef hmi fill:#ffccbc,stroke:#d84315,stroke-width:1px,color:black
classDef logic fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,color:black,stroke-dasharray: 5 5

class Setup,Loop,WDT,Act_Btn mcu
class Act_Sens,Act_DHT_Mgr,Act_DHT_Req,Act_INA sensor
class Act_FSM,Setup actuator
class Act_TX comm
class Act_Led,T_Btn hmi
class T_Led,T_Servo,T_DHT_Start,T_Comms logic
```

## 3. Fluxograma Interrupções

```mermaid
flowchart TB
%% --- ESTILOS ---
classDef mcu fill:#bbdefb,stroke:#1565c0,stroke-width:2px,color:black
classDef comm fill:#d1c4e9,stroke:#512da8,stroke-width:2px,color:black
classDef sensor fill:#e1f5fe,stroke:#0288d1,stroke-width:1px,color:black
classDef term fill:#000,stroke:#000,stroke-width:2px,color:white

%% --- 1. TIMER (Base de Tempo) ---
subgraph Timer0 ["ISR(TIMER0) - 1kHz"]
      direction TB
      T0_Start((Início)):::term --> T0_Inc["millis++"]:::mcu
      T0_Inc --> T0_End((Fim)):::term
end

%% --- 2. DHT SENSOR (INT0) ---
subgraph Int0 ["ISR(INT0) - Leitura DHT"]
      direction TB
      D_Start((Início)):::term --> D_Edge["Mede Pulso<br>(Lê TCNT2)"]:::sensor
      D_Edge --> D_Store["Armazena Bit (0 ou 1)"]:::mcu
      D_Store --> D_Check{"40 Bits?"}:::mcu
      D_Check -- Sim --> D_Flag["Flag: Dados Prontos"]:::mcu
      D_Check -- Não --> D_End((Fim)):::term
      D_Flag --> D_End
end

%% --- 3. UART RX (Processamento Imediato) ---
subgraph Rx ["ISR(RX) - Comandos"]
      direction TB
      Rx_Start((Início)):::term --> Rx_Read["Ler Char (UDR0)"]:::comm
      Rx_Read --> Rx_Decide{"É Comando?"}:::mcu
      Rx_Decide -- 'A'/'M'/'N'/'S' --> Rx_State["Muda Estado<br>(Auto/Manual/Noite)"]:::mcu
      Rx_Decide -- 'C'/'B'/'E'/'D' --> Rx_Move["Ajusta Ângulos<br>Servos"]:::mcu
      Rx_State --> Rx_End((Fim)):::term
      Rx_Move --> Rx_End
end

%% --- 4. UART TX (Ring Buffer) ---
subgraph Tx ["ISR(UDRE) - Envio"]
      direction TB
      Tx_Start((Início)):::term --> Tx_Check{"Há Dados?"}:::mcu
      Tx_Check -- Sim --> Tx_Send["UDR0 = Buffer[Cauda]"]:::comm
      Tx_Send --> Tx_Inc["Cauda++"]:::mcu
      Tx_Check -- Não --> Tx_Stop["Desliga IRQ"]:::mcu
      Tx_Inc --> Tx_End((Fim)):::term
      Tx_Stop --> Tx_End
end
```

## 4. Fluxograma PID

```mermaid
flowchart TD
%% --- ESTILOS ---
classDef process fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:black
classDef decision fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,color:black,stroke-dasharray: 5 5
classDef calc fill:#e0e0e0,stroke:#616161,stroke-width:1px,color:black
classDef hardware fill:#ffccbc,stroke:#d84315,stroke-width:1px,color:black
classDef endnode fill:#000,stroke:#000,stroke-width:2px,color:white

%% === 1. PREPARAÇÃO & SEGURANÇA ===
Start((Início)) --> Calib["1. Aplicar Calibração<br>(LDRs * Ganhos)"]:::calc
Calib --> LuzMedia["Calc. Luz Média"]:::calc

LuzMedia --> CheckSafe{"2. Luz Segura?<br>(>80 e <980)"}:::decision

CheckSafe -- Não --> ResetAll["Reset PIDs<br>Relaxar Servos"]:::process
ResetAll --> Fim((Fim)):::endnode

%% === 2. CONFIGURAÇÃO DINÂMICA ===
CheckSafe -- Sim --> CheckBright{"3. Luz Forte?<br>(> 750)"}:::decision

CheckBright -- Sim --> ParamHigh["<b>Modo Suave</b><br>Kp Baixo (x0.3)<br>Ki = 0<br>Tol = 150"]:::process
CheckBright -- Não --> ParamNorm["<b>Modo Normal</b><br>Kp Base<br>Ki Base<br>Tol = 40"]:::process

ParamHigh --> CalcDiffs
ParamNorm --> CalcDiffs

CalcDiffs["4. Calcular Diferenças<br>V = (Sup-Inf)<br>H = (Esq-Dir)"]:::calc

%% === 3. EIXO VERTICAL ===
CalcDiffs --> CondV{"5. Erro V > Tol?"}:::decision

CondV -- Não --> ResetV["Reset PID Vert"]:::process

CondV -- Sim --> PidV["Calc PID Vertical"]:::calc
PidV --> ClampV["Limit Passo (±1.8°)<br>Atualizar Var. Vertical"]:::calc

ResetV --> CondH
ClampV --> SetFlagV["Flag: Moveu = 1"]:::process
SetFlagV --> CondH

%% === 4. EIXO HORIZONTAL ===
CondH{"6. Erro H > Tol?"}:::decision

CondH -- Não --> ResetH["Reset PID Horiz"]:::process

CondH -- Sim --> PidH["Calc PID Horiz"]:::calc
PidH --> ClampH["Limit Passo (±1.8°)<br>Atualizar Var. Horizontal"]:::calc

ResetH --> CheckMove
ClampH --> SetFlagH["Flag: Moveu = 1"]:::process
SetFlagH --> CheckMove

%% === 5. ATUAÇÃO FÍSICA ===
CheckMove{"7. Flag Moveu?"}:::decision

CheckMove -- Sim --> Limits["Clamp Limites Físicos<br>(Servos Min/Max)"]:::calc
Limits --> Servo["<b>Mover Servos</b><br>(PWM)"]:::hardware
Servo --> Timer["Reset Timer Estabilidade"]:::process

CheckMove -- Não --> Timeout{"Timeout<br>Estabilidade?"}:::decision
Timeout -- Sim --> Relax["Relaxar Servos<br>(Desligar PWM)"]:::hardware
Timeout -- Não --> Fim

Timer --> Fim
Relax --> Fim
```

## 5. Fluxograma Máquina de Estados DHT22

```mermaid
flowchart TD
%% --- ESTILOS ---
classDef mcu fill:#bbdefb,stroke:#1565c0,stroke-width:2px,color:black,font-weight:bold
classDef sensor fill:#e1f5fe,stroke:#0288d1,stroke-width:1px,color:black
classDef logic fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,color:black,stroke-dasharray: 5 5
classDef err fill:#ffcdd2,stroke:#c62828,stroke-width:1px,color:black
classDef data fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px,color:black

%% --- ENTRADA ---
Start((Início)) --> CheckState{Switch<br>estado_dht}:::mcu

%% === ESTADO 0: OCIOSO ===
CheckState -- 0: OCIOSO --> T_Wait{"Timer > 3s?"}:::logic
T_Wait -- Não --> CheckFlag
T_Wait -- Sim --> SetLow["Pin = OUTPUT LOW<br>Gravar Tempo Inicial"]:::sensor
SetLow --> Next1["estado = INICIO"]:::mcu
Next1 --> CheckFlag

%% === ESTADO 1: INICIO (Request) ===
CheckState -- 1: INICIO --> T_Low{"Tempo > 18ms?"}:::logic
T_Low -- Não --> CheckFlag
T_Low -- Sim --> SetInput["Pin = INPUT_PULLUP<br><b>Ativar INT0 (ISR)</b>"]:::sensor
SetInput --> Next2["estado = ESPERA"]:::mcu
Next2 --> CheckFlag

%% === ESTADO 2: ESPERA (Watchdog do Sensor) ===
%% AQUI ESTA A CORREÇÃO: O Loop só verifica timeout. A ISR lê os dados.
CheckState -- 2: ESPERA --> T_Out{"Timeout > 30ms?<br>(ISR falhou?)"}:::err

T_Out -- Não --> CheckFlag
T_Out -- Sim --> Error["Erro = 1<br>Desligar INT0"]:::err
Error --> ResetCycle

%% === PROCESSAMENTO DE DADOS (Fora da FSM) ===
CheckFlag{"Flag ISR?<br>(novos_dados)"}:::logic

CheckFlag -- Não --> Exit((Sair))
CheckFlag -- Sim --> Checksum{"Checksum OK?<br>(Calculado na ISR)"}:::logic

Checksum -- Não --> LogErr["Manter Antigos<br>Registar Erro"]:::err
Checksum -- Sim --> Convert["Converter Binário -> Variáveis<br>T_Safe / H_Safe"]:::data

LogErr --> ResetCycle["estado = OCIOSO<br>Reset Flag"]:::mcu
Convert --> ResetCycle
ResetCycle --> Exit

%% --- LEGENDA ---
linkStyle default stroke-width:2px,fill:none,stroke:#333
```

## 6. Fluxograma ESP8266

```mermaid
flowchart TD
      %% --- CLASSES (Paleta do Projeto) ---
      classDef mcu fill:#bbdefb,stroke:#1565c0,stroke-width:2px,color:black
      classDef cloud fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px,color:black
      classDef comm fill:#d1c4e9,stroke:#512da8,stroke-width:2px,color:black
      classDef logic fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,color:black,stroke-dasharray: 5 5

      %% --- BOOT ---
      Boot([Início]) --> ConnectWF["Conectar Wi-Fi Multi"]:::mcu
      ConnectWF --> ConnectMQTT["Conectar Broker HiveMQ"]:::cloud
      ConnectMQTT --> NTP["Sincronizar Hora NTP"]:::cloud
      NTP --> Loop{Loop Principal}:::mcu

      %% --- VIA 1: TELEMETRIA (DADOS A SUBIR) ---
      Loop -->|Serial Available?| ReadString["Ler String Formatada<br>(T:xx H:xx...)"]:::comm
      ReadString --> Parse{"Parse sscanf<br>OK?"}:::logic
      
      Parse -- Sim --> BuildJSON["Criar JSON (ArduinoJson)"]:::mcu
      BuildJSON --> PubMQTT["Publicar MQTT<br>topic: .../dados"]:::cloud
      PubMQTT --> HttpTS["HTTP GET ThingSpeak"]:::cloud
      
      Parse -- Não --> Loop
      HttpTS --> Loop

      %% --- VIA 2: GESTÃO DE HORÁRIO (AUTOMÁTICA) ---
      Loop -->|"Timer > 60s?"| CheckTime{"É Noite?<br>< 6h ou > 20h"}:::logic
      
      CheckTime -- Sim --> SendN["Enviar Serial: 'N'<br>(Sugestão Noite)"]:::comm
      CheckTime -- Não --> SendA["Enviar Serial: 'S'<br>(Sugestão Dia)"]:::comm
      
      SendN --> Loop
      SendA --> Loop

      %% --- VIA 3: COMANDOS REMOTOS (CALLBACK) ---
      Loop -->|MQTT Callback| CheckCmd{"Recebeu CMD<br>do Broker?"}:::cloud
      
      CheckCmd -- Sim --> Intercept{"É 'A' mas<br>está de Noite?"}:::logic
      
      Intercept -- Sim --> SmartNight["Enviar 'A' depois 'N'<br>(Forçar Repouso)"]:::mcu
      Intercept -- Não --> FwdCmd["Reenviar Char para ATmega"]:::comm
      
      SmartNight --> Loop
      FwdCmd --> Loop
      CheckCmd -- Não --> Loop

      %% Ajuste visual
      linkStyle default stroke-width:2px,fill:none,stroke:#333
```

## 7. Fluxograma Python

```mermaid
flowchart TD
%% --- ESTILOS ---
classDef gui fill:#ffccbc,stroke:#d84315,stroke-width:1px,color:black
classDef worker fill:#e1f5fe,stroke:#0288d1,stroke-width:2px,color:black
classDef cloud fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px,color:black
classDef io fill:#d1c4e9,stroke:#512da8,stroke-width:2px,color:black

%% --- NÓS ---
Start([Início App]):::gui

%% Interface
Window["Janela Tkinter<br>(Ver Dados / Botões)"]:::gui
UserAction{"Ação do<br>Utilizador"}:::gui

%% Lógica de Ponte
QueueCmd["Fila de Comandos<br>(Queue CMD)"]:::worker
QueueLog["Fila de Logs<br>(Queue LOG)"]:::worker

%% Backend Async
BleLoop{"Loop Principal<br>(Asyncio + Bleak)"}:::io

%% Saídas Externas
Cloud["HTTP ThingSpeak<br>(Upload 15s)"]:::cloud
Arduino["Hardware HC-05<br>(Bluetooth)"]:::io

%% --- FLUXO ---
Start --> Window
Window <--> UserAction

%% Caminho de Envio (User -> Arduino)
UserAction -- "Clicar / Teclar" --> QueueCmd
QueueCmd -.->|Ler Async| BleLoop
BleLoop -->|Write Char| Arduino

%% Caminho de Receção (Arduino -> User/Cloud)
Arduino -->|Notify| BleLoop
BleLoop -- "Validar Dados" --> QueueLog
QueueLog -.->|Update GUI| Window

%% Caminho Nuvem
BleLoop -->|Post| Cloud

%% Ajuste visual
linkStyle default stroke-width:2px,fill:none,stroke:#333
```
