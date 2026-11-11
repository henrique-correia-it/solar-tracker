#define F_CPU 16000000UL

#define LIMITE_LUZ_EXCESSIVA 980
#define LIMITE_ESCURIDAO 80

#define ESTADO_PAUSE 0
#define ESTADO_AUTO 1
#define ESTADO_MANUAL 2
#define ESTADO_NIGHT 3

#define CALIB_SUP_ESQ 1.13f
#define CALIB_SUP_DIR 1.f
#define CALIB_INF_ESQ 1.019f
#define CALIB_INF_DIR 1.089f

#define FATOR_SUAVIZACAO 0.08f

#define PID_KP_BASE 0.018f
#define PID_KI_BASE 0.0005f
#define PID_KD_BASE 0.020f

#define TOLERANCIA_PADRAO 35.0f
#define TOLERANCIA_LUZ_FORTE 150.0f

#define MOVIMENTO_MINIMO 0.5f
#define LIMITE_INTEGRAL 200.0f
#define MAX_PASSO_POR_CICLO 1.0f

#define PARK_HORIZ 5.0f
#define PARK_VERT 45.0f

#define INA219_ADDR 0x40
#define SCL_CLOCK 100000L
#define I2C_TIMEOUT 50000

#include <avr/interrupt.h>
#include <avr/io.h>
#include <stdio.h>

#define WDT_RESET() asm volatile("wdr")

#define ABS_FLOAT(x) ((x) < 0 ? -(x) : (x))
#define ABS_INT(x) ((x) < 0 ? -(x) : (x))

#define CANAL_LDR_SE 0
#define CANAL_LDR_SD 1
#define CANAL_LDR_IE 2
#define CANAL_LDR_ID 3

#define INTERVALO_SERVOS_MS 50
#define INTERVALO_LED_MS 500
#define INTERVALO_SENSOR_DHT 3000

#define TEMPO_ATE_DESLIGAR_MS 200
#define TEMPO_TIMEOUT_MANUAL 500

#define SERVO_HORIZ_MAX 175
#define SERVO_HORIZ_MIN 5
#define SERVO_VERT_MAX 90
#define SERVO_VERT_MIN 10

#define TAMANHO_BUFFER_SERIAL 128
#define DHT_OCIOSO 0
#define DHT_INICIO 1
#define DHT_ESPERA 2
#define DHT_RECEBE 3

typedef struct {
  float integral;
  float erro_anterior;
} PID_Estado;

volatile uint32_t sistema_millis = 0;
uint32_t ultima_vez_led = 0;
uint32_t ultima_vez_servos = 0;
uint32_t ultima_vez_dht = 0;
uint32_t inicio_estabilidade = 0;
uint32_t ultimo_debounce_btn = 0;

volatile uint8_t estado_sistema = ESTADO_AUTO;
volatile uint8_t estado_anterior = ESTADO_AUTO;

float angulo_atual_horiz = 90.0;
float angulo_atual_vert = 45.0;
uint8_t motores_ligados = 1;

float media_ldr_se = 0;
float media_ldr_sd = 0;
float media_ldr_ie = 0;
float media_ldr_id = 0;
uint8_t canal_adc_atual = 0;

PID_Estado pid_horiz_state;
PID_Estado pid_vert_state;

volatile uint8_t estado_dht = DHT_OCIOSO;
volatile uint8_t dht_bits[5];
volatile uint8_t dht_indice_bit = 0;
volatile uint8_t dht_indice_byte = 0;
volatile uint32_t tempo_inicio_dht = 0;
volatile int16_t temperatura_bruta = 0;
volatile uint16_t humidade_bruta = 0;
volatile uint8_t novos_dados_dht = 0;
volatile uint8_t dht_erro = 0;

volatile char buffer_transmissao[TAMANHO_BUFFER_SERIAL];
volatile uint8_t cabeca_tx = 0;
volatile uint8_t cauda_tx = 0;

uint8_t i2c_err_flag = 0;

void i2c_init(void) {
  TWSR = 0;
  TWBR = ((F_CPU / SCL_CLOCK) - 16) / 2;
}

uint8_t i2c_start(void) {
  TWCR = (1 << TWINT) | (1 << TWSTA) | (1 << TWEN);
  uint32_t counter = I2C_TIMEOUT;
  while (!(TWCR & (1 << TWINT))) {
    if (--counter == 0)
      return 1;
  }
  return 0;
}

void i2c_stop(void) { TWCR = (1 << TWINT) | (1 << TWSTO) | (1 << TWEN); }

uint8_t i2c_write(uint8_t dado) {
  TWDR = dado;
  TWCR = (1 << TWINT) | (1 << TWEN);
  uint32_t counter = I2C_TIMEOUT;
  while (!(TWCR & (1 << TWINT))) {
    if (--counter == 0)
      return 1;
  }
  return 0;
}

uint8_t i2c_read_ack(uint8_t *data_out) {
  TWCR = (1 << TWINT) | (1 << TWEN) | (1 << TWEA);
  uint32_t counter = I2C_TIMEOUT;
  while (!(TWCR & (1 << TWINT))) {
    if (--counter == 0)
      return 1;
  }
  *data_out = TWDR;
  return 0;
}

uint8_t i2c_read_nack(uint8_t *data_out) {
  TWCR = (1 << TWINT) | (1 << TWEN);
  uint32_t counter = I2C_TIMEOUT;
  while (!(TWCR & (1 << TWINT))) {
    if (--counter == 0)
      return 1;
  }
  *data_out = TWDR;
  return 0;
}

void ler_ina219_dados(int16_t *v_mv, int16_t *i_ma, int32_t *p_mw) {
  uint8_t high_byte, low_byte;
  int16_t raw_bus, raw_shunt;
  i2c_err_flag = 0;

  if (i2c_start()) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_write((INA219_ADDR << 1) | 0)) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_write(0x02)) {
    i2c_err_flag = 1;
    return;
  }

  if (i2c_start()) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_write((INA219_ADDR << 1) | 1)) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_read_ack(&high_byte)) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_read_nack(&low_byte)) {
    i2c_err_flag = 1;
    return;
  }
  i2c_stop();

  raw_bus = (high_byte << 8) | low_byte;
  *v_mv = (raw_bus >> 3) * 4;

  if (i2c_start()) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_write((INA219_ADDR << 1) | 0)) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_write(0x01)) {
    i2c_err_flag = 1;
    return;
  }

  if (i2c_start()) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_write((INA219_ADDR << 1) | 1)) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_read_ack(&high_byte)) {
    i2c_err_flag = 1;
    return;
  }
  if (i2c_read_nack(&low_byte)) {
    i2c_err_flag = 1;
    return;
  }
  i2c_stop();

  raw_shunt = (high_byte << 8) | low_byte;
  *i_ma = raw_shunt / 10;
  *p_mw = ((int32_t)(*v_mv) * (int32_t)(*i_ma)) / 1000;
}

uint32_t millis_seguro() {
  uint32_t m;
  uint8_t sreg_antigo = SREG;
  cli();
  m = sistema_millis;
  SREG = sreg_antigo;
  return m;
}

void limpar_buffer_dht() {
  for (uint8_t i = 0; i < 5; i++)
    dht_bits[i] = 0;
}

void enviar_char_serial(char c) {
  uint8_t proxima_cabeca = (cabeca_tx + 1) & (TAMANHO_BUFFER_SERIAL - 1);
  if (proxima_cabeca != cauda_tx) {
    buffer_transmissao[proxima_cabeca] = c;
    cabeca_tx = proxima_cabeca;
    UCSR0B |= (1 << UDRIE0);
  }
}

static int uart_putchar(char c, FILE *stream) {
  if (c == '\n')
    uart_putchar('\r', stream);
  enviar_char_serial(c);
  return 0;
}
FILE uart_output = FDEV_SETUP_STREAM(uart_putchar, NULL, _FDEV_SETUP_WRITE);

void ativar_servos() {
  if (motores_ligados)
    return;
  TCCR1A |= (1 << COM1A1) | (1 << COM1B1);
  motores_ligados = 1;
}

void relaxar_servos() {
  if (!motores_ligados)
    return;
  TCCR1A &= ~((1 << COM1A1) | (1 << COM1B1));
  motores_ligados = 0;
}

long mapear_valor(long x, long in_min, long in_max, long out_min,
                  long out_max) {
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

void aplicar_angulo_servos(float angulo_h, float angulo_v) {
  if (angulo_h > 180)
    angulo_h = 180;
  if (angulo_h < 0)
    angulo_h = 0;
  if (angulo_v > 180)
    angulo_v = 180;
  if (angulo_v < 0)
    angulo_v = 0;

  OCR1A = mapear_valor((long)angulo_h, 0, 180, 1000, 5000);
  OCR1B = mapear_valor((long)angulo_v, 0, 180, 1000, 5000);
}

void reset_pid(PID_Estado *pid) {
  pid->integral = 0;
  pid->erro_anterior = 0;
}

float calcular_pid(PID_Estado *pid, float erro_atual, float kp, float ki,
                   float kd) {
  float P = kp * erro_atual;
  pid->integral += erro_atual;
  if (pid->integral > LIMITE_INTEGRAL)
    pid->integral = LIMITE_INTEGRAL;
  else if (pid->integral < -LIMITE_INTEGRAL)
    pid->integral = -LIMITE_INTEGRAL;
  float I = ki * pid->integral;
  float D = kd * (erro_atual - pid->erro_anterior);
  pid->erro_anterior = erro_atual;
  float saida = P + I + D;
  if (ABS_FLOAT(saida) < MOVIMENTO_MINIMO)
    return 0.0f;
  return saida;
}

ISR(TIMER0_COMPA_vect) { sistema_millis++; }

ISR(USART_UDRE_vect) {
  if (cabeca_tx != cauda_tx) {
    cauda_tx = (cauda_tx + 1) & (TAMANHO_BUFFER_SERIAL - 1);
    UDR0 = buffer_transmissao[cauda_tx];
  } else {
    UCSR0B &= ~(1 << UDRIE0);
  }
}

ISR(USART_RX_vect) {
  char cmd = UDR0;

  if (cmd == 'A') {
    estado_sistema = ESTADO_AUTO;
    reset_pid(&pid_horiz_state);
    reset_pid(&pid_vert_state);
  } else if (cmd == 'M') {
    estado_sistema = ESTADO_MANUAL;
    ativar_servos();
    inicio_estabilidade = millis_seguro();
  }

  else if (cmd == 'N') {

    if (estado_sistema == ESTADO_AUTO) {
      estado_sistema = ESTADO_NIGHT;
      ativar_servos();
      inicio_estabilidade = millis_seguro();
    }
  } else if (cmd == 'S') {

    if (estado_sistema == ESTADO_NIGHT) {
      estado_sistema = ESTADO_AUTO;
      reset_pid(&pid_horiz_state);
      reset_pid(&pid_vert_state);
    }
  }

  else if (cmd == 'C' || cmd == 'B' || cmd == 'E' || cmd == 'D') {
    estado_sistema = ESTADO_MANUAL;
    ativar_servos();
    inicio_estabilidade = millis_seguro();

    if (cmd == 'C')
      angulo_atual_vert -= 2.0;
    if (cmd == 'B')
      angulo_atual_vert += 2.0;
    if (cmd == 'E')
      angulo_atual_horiz += 2.0;
    if (cmd == 'D')
      angulo_atual_horiz -= 2.0;

    if (angulo_atual_horiz > SERVO_HORIZ_MAX)
      angulo_atual_horiz = SERVO_HORIZ_MAX;
    if (angulo_atual_horiz < SERVO_HORIZ_MIN)
      angulo_atual_horiz = SERVO_HORIZ_MIN;

    if (angulo_atual_vert > SERVO_VERT_MAX)
      angulo_atual_vert = SERVO_VERT_MAX;
    if (angulo_atual_vert < SERVO_VERT_MIN)
      angulo_atual_vert = SERVO_VERT_MIN;

    aplicar_angulo_servos(angulo_atual_horiz, angulo_atual_vert);
  }
}

ISR(INT0_vect) {

  uint8_t valor_timer = TCNT2;
  TCNT2 = 0;

  if (estado_dht == DHT_ESPERA) {
    static uint8_t contador_bordas = 0;
    contador_bordas++;
    if (contador_bordas >= 3) {
      estado_dht = DHT_RECEBE;
      dht_indice_bit = 0;
      dht_indice_byte = 0;
      limpar_buffer_dht();
      contador_bordas = 0;
    }
    return;
  }
  if (estado_dht == DHT_RECEBE) {
    if (!(PIND & (1 << PD2))) {
      if (valor_timer > 12)
        dht_bits[dht_indice_byte] |= (1 << (7 - dht_indice_bit));
      dht_indice_bit++;
      if (dht_indice_bit >= 8) {
        dht_indice_bit = 0;
        dht_indice_byte++;
      }
      if (dht_indice_byte >= 5) {
        estado_dht = DHT_OCIOSO;
        EIMSK &= ~(1 << INT0);
        uint8_t soma = dht_bits[0] + dht_bits[1] + dht_bits[2] + dht_bits[3];
        if (soma == dht_bits[4]) {
          humidade_bruta = (dht_bits[0] << 8) | dht_bits[1];
          int16_t temp = (dht_bits[2] << 8) | dht_bits[3];
          if (temp & 0x8000) {
            temp &= 0x7FFF;
            temp = -temp;
          }
          temperatura_bruta = temp;
          dht_erro = 0;
        } else {
          dht_erro = 2;
        }
        novos_dados_dht = 1;
      }
    }
  }
}

void tarefa_leitura_sensores() {
  if (estado_sistema == ESTADO_PAUSE)
    return;

  if (!(ADCSRA & (1 << ADSC))) {
    uint16_t resultado = ADC;
    switch (canal_adc_atual) {
    case CANAL_LDR_SE:
      media_ldr_se = (media_ldr_se * (1.0 - FATOR_SUAVIZACAO)) +
                     (resultado * FATOR_SUAVIZACAO);
      break;
    case CANAL_LDR_SD:
      media_ldr_sd = (media_ldr_sd * (1.0 - FATOR_SUAVIZACAO)) +
                     (resultado * FATOR_SUAVIZACAO);
      break;
    case CANAL_LDR_IE:
      media_ldr_ie = (media_ldr_ie * (1.0 - FATOR_SUAVIZACAO)) +
                     (resultado * FATOR_SUAVIZACAO);
      break;
    case CANAL_LDR_ID:
      media_ldr_id = (media_ldr_id * (1.0 - FATOR_SUAVIZACAO)) +
                     (resultado * FATOR_SUAVIZACAO);
      break;
    }
    canal_adc_atual++;
    if (canal_adc_atual > 3)
      canal_adc_atual = 0;
    ADMUX = (ADMUX & 0xF0) | (canal_adc_atual & 0x0F);
    ADCSRA |= (1 << ADSC);
  }
}

void maquina_estados_atuacao() {

  if (estado_sistema == ESTADO_PAUSE) {
    relaxar_servos();
    return;
  }

  if (estado_sistema == ESTADO_MANUAL) {

    if (motores_ligados &&
        (millis_seguro() - inicio_estabilidade > TEMPO_TIMEOUT_MANUAL)) {
      relaxar_servos();
    }
    return;
  }

  if (estado_sistema == ESTADO_NIGHT) {
    float diff_h = angulo_atual_horiz - PARK_HORIZ;
    float diff_v = angulo_atual_vert - PARK_VERT;
    uint8_t moveu = 0;

    if (ABS_FLOAT(diff_h) > 0.5f) {
      angulo_atual_horiz -= (diff_h > 0 ? 0.5f : -0.5f);
      moveu = 1;
    }
    if (ABS_FLOAT(diff_v) > 0.5f) {
      angulo_atual_vert -= (diff_v > 0 ? 0.5f : -0.5f);
      moveu = 1;
    }

    if (moveu) {
      ativar_servos();
      aplicar_angulo_servos(angulo_atual_horiz, angulo_atual_vert);
      inicio_estabilidade = millis_seguro();
    } else {
      if (motores_ligados &&
          (millis_seguro() - inicio_estabilidade > TEMPO_ATE_DESLIGAR_MS)) {
        relaxar_servos();
      }
    }
    return;
  }

  if (estado_sistema == ESTADO_AUTO) {

    float valor_se = media_ldr_se * CALIB_SUP_ESQ;
    float valor_sd = media_ldr_sd * CALIB_SUP_DIR;
    float valor_ie = media_ldr_ie * CALIB_INF_ESQ;
    float valor_id = media_ldr_id * CALIB_INF_DIR;

    float luz_media = (valor_se + valor_sd + valor_ie + valor_id) / 4.0;

    if (luz_media > LIMITE_LUZ_EXCESSIVA || luz_media < LIMITE_ESCURIDAO) {
      if (motores_ligados)
        relaxar_servos();
      reset_pid(&pid_horiz_state);
      reset_pid(&pid_vert_state);
      return;
    }

    float tolerancia_atual;
    float kp_atual = PID_KP_BASE;
    float ki_atual = PID_KI_BASE;

    if (luz_media > 750) {
      kp_atual = PID_KP_BASE * 0.2f;
      ki_atual = 0;
      tolerancia_atual = TOLERANCIA_LUZ_FORTE;
    } else {
      tolerancia_atual = TOLERANCIA_PADRAO;
    }

    float diff_vertical =
        ((valor_se + valor_sd) / 2.0) - ((valor_ie + valor_id) / 2.0);
    float diff_horizontal =
        ((valor_se + valor_ie) / 2.0) - ((valor_sd + valor_id) / 2.0);

    uint8_t moveu = 0;

    if (ABS_FLOAT(diff_vertical) > tolerancia_atual) {
      float ajuste_v = calcular_pid(&pid_vert_state, diff_vertical, kp_atual,
                                    ki_atual, PID_KD_BASE);

      if (ajuste_v > MAX_PASSO_POR_CICLO)
        ajuste_v = MAX_PASSO_POR_CICLO;
      if (ajuste_v < -MAX_PASSO_POR_CICLO)
        ajuste_v = -MAX_PASSO_POR_CICLO;

      float novo_angulo_v = angulo_atual_vert - ajuste_v;
      uint8_t limite_atingido = 0;

      if (novo_angulo_v > SERVO_VERT_MAX) {
        novo_angulo_v = SERVO_VERT_MAX;
        limite_atingido = 1;
      }
      if (novo_angulo_v < SERVO_VERT_MIN) {
        novo_angulo_v = SERVO_VERT_MIN;
        limite_atingido = 1;
      }

      if (limite_atingido) {

        pid_vert_state.integral = 0;
      }

      if (ABS_FLOAT(novo_angulo_v - angulo_atual_vert) > 0.1f) {
        angulo_atual_vert = novo_angulo_v;
        moveu = 1;
      }

    } else {
      reset_pid(&pid_vert_state);
    }

    if (ABS_FLOAT(diff_horizontal) > tolerancia_atual) {
      float ajuste_h = calcular_pid(&pid_horiz_state, diff_horizontal, kp_atual,
                                    ki_atual, PID_KD_BASE);

      if (ajuste_h > MAX_PASSO_POR_CICLO)
        ajuste_h = MAX_PASSO_POR_CICLO;
      if (ajuste_h < -MAX_PASSO_POR_CICLO)
        ajuste_h = -MAX_PASSO_POR_CICLO;

      float novo_angulo_h = angulo_atual_horiz - ajuste_h;
      uint8_t limite_atingido_h = 0;

      if (novo_angulo_h > SERVO_HORIZ_MAX) {
        novo_angulo_h = SERVO_HORIZ_MAX;
        limite_atingido_h = 1;
      }
      if (novo_angulo_h < SERVO_HORIZ_MIN) {
        novo_angulo_h = SERVO_HORIZ_MIN;
        limite_atingido_h = 1;
      }

      if (limite_atingido_h) {
        pid_horiz_state.integral = 0;
      }

      if (ABS_FLOAT(novo_angulo_h - angulo_atual_horiz) > 0.1f) {
        angulo_atual_horiz = novo_angulo_h;
        moveu = 1;
      }

    } else {
      reset_pid(&pid_horiz_state);
    }

    if (moveu) {
      ativar_servos();
      inicio_estabilidade = millis_seguro();

      if (angulo_atual_horiz > SERVO_HORIZ_MAX)
        angulo_atual_horiz = SERVO_HORIZ_MAX;
      if (angulo_atual_horiz < SERVO_HORIZ_MIN)
        angulo_atual_horiz = SERVO_HORIZ_MIN;
      if (angulo_atual_vert > SERVO_VERT_MAX)
        angulo_atual_vert = SERVO_VERT_MAX;
      if (angulo_atual_vert < SERVO_VERT_MIN)
        angulo_atual_vert = SERVO_VERT_MIN;

      aplicar_angulo_servos(angulo_atual_horiz, angulo_atual_vert);
    } else {
      if (motores_ligados &&
          (millis_seguro() - inicio_estabilidade > TEMPO_ATE_DESLIGAR_MS)) {
        relaxar_servos();
      }
    }
  }
}

void configurar_hardware() {
  DDRB |= (1 << DDB5);

  ADMUX = (1 << REFS0);
  ADCSRA =
      (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0) | (1 << ADSC);

  TCCR0A = (1 << WGM01);
  TCCR0B = (1 << CS01) | (1 << CS00);
  OCR0A = 249;
  TIMSK0 |= (1 << OCIE0A);

  DDRB |= (1 << DDB1) | (1 << DDB2);
  TCCR1A = (1 << COM1A1) | (1 << COM1B1) | (1 << WGM11);
  TCCR1B = (1 << WGM13) | (1 << WGM12) | (1 << CS11);
  ICR1 = 39999;

  TCCR2A = 0;
  TCCR2B = (1 << CS22);
  EICRA |= (1 << ISC00);

  DDRD &= ~(1 << DDD5);
  PORTD |= (1 << PORTD5);

#define BAUD 9600
#define VALOR_UBRR ((F_CPU / 16 / BAUD) - 1)
  UBRR0H = (uint8_t)(VALOR_UBRR >> 8);
  UBRR0L = (uint8_t)VALOR_UBRR;
  UCSR0B = (1 << TXEN0) | (1 << RXEN0) | (1 << RXCIE0);

  stdout = &uart_output;
  i2c_init();

  WDT_RESET();
  WDTCSR |= (1 << WDCE) | (1 << WDE);
  WDTCSR = (1 << WDE) | (1 << WDP2) | (1 << WDP1) | (1 << WDP0);

  sei();

  reset_pid(&pid_horiz_state);
  reset_pid(&pid_vert_state);
}

void pedir_leitura_dht() {
  if (estado_dht != DHT_OCIOSO)
    return;
  DDRD |= (1 << PD2);
  PORTD &= ~(1 << PD2);
  tempo_inicio_dht = millis_seguro();
  estado_dht = DHT_INICIO;
}

void gerir_maquina_estados_dht() {
  if (estado_dht == DHT_INICIO && (millis_seguro() - tempo_inicio_dht) >= 2) {
    PORTD |= (1 << PD2);
    DDRD &= ~(1 << PD2);
    TCNT2 = 0;
    EIFR |= (1 << INTF0);
    EIMSK |= (1 << INT0);
    estado_dht = DHT_ESPERA;
  }
  if (estado_dht != DHT_OCIOSO && (millis_seguro() - tempo_inicio_dht) > 30) {
    if (estado_dht == DHT_RECEBE || estado_dht == DHT_ESPERA) {
      estado_dht = DHT_OCIOSO;
      EIMSK &= ~(1 << INT0);
      dht_erro = 1;
      novos_dados_dht = 1;
    }
  }
}

int main(void) {
  MCUSR &= ~(1 << WDRF);
  WDTCSR |= (1 << WDCE) | (1 << WDE);
  WDTCSR = 0x00;

  configurar_hardware();
  aplicar_angulo_servos(angulo_atual_horiz, angulo_atual_vert);
  inicio_estabilidade = millis_seguro();

  printf("STATUS:START\n");

  while (1) {
    WDT_RESET();
    uint32_t tempo_atual = millis_seguro();

    if (tempo_atual - ultima_vez_led >= INTERVALO_LED_MS) {
      ultima_vez_led = tempo_atual;
      PORTB ^= (1 << PB5);
    }

    if (!(PIND & (1 << PD5))) {
      if (tempo_atual - ultimo_debounce_btn > 500) {
        ultimo_debounce_btn = tempo_atual;

        if (estado_sistema != ESTADO_PAUSE) {

          estado_anterior = estado_sistema;
          estado_sistema = ESTADO_PAUSE;
          printf("STATUS:OFF\n");
        } else {

          estado_sistema = estado_anterior;
          inicio_estabilidade = tempo_atual;
          printf("STATUS:RESUME\n");
        }
      }
    }

    tarefa_leitura_sensores();

    if (tempo_atual - ultima_vez_servos >= INTERVALO_SERVOS_MS) {
      ultima_vez_servos = tempo_atual;
      maquina_estados_atuacao();
    }

    if (tempo_atual - ultima_vez_dht >= INTERVALO_SENSOR_DHT) {
      ultima_vez_dht = tempo_atual;
      pedir_leitura_dht();
    }
    gerir_maquina_estados_dht();

    if (novos_dados_dht) {
      uint8_t sreg_old = SREG;
      cli();
      int16_t t_safe = temperatura_bruta;
      uint16_t h_safe = humidade_bruta;
      uint8_t erro_dht_safe = dht_erro;
      SREG = sreg_old;
      novos_dados_dht = 0;

      int16_t tensao_solar_mv = 0;
      int16_t corrente_solar_ma = 0;
      int32_t potencia_solar_mw = 0;

      ler_ina219_dados(&tensao_solar_mv, &corrente_solar_ma,
                       &potencia_solar_mw);

      int cal_se = (int)(media_ldr_se * CALIB_SUP_ESQ);
      int cal_sd = (int)(media_ldr_sd * CALIB_SUP_DIR);
      int cal_ie = (int)(media_ldr_ie * CALIB_INF_ESQ);
      int cal_id = (int)(media_ldr_id * CALIB_INF_DIR);

      if (erro_dht_safe == 0) {
        printf("T:%d.%d H:%d.%d S:%d:%d:%ld L:%d,%d,%d,%d LC:%d,%d,%d,%d M:%d "
               "| H:%d V:%d\n",
               t_safe / 10, ABS_INT(t_safe % 10), h_safe / 10, h_safe % 10,
               tensao_solar_mv, corrente_solar_ma, potencia_solar_mw,
               (int)media_ldr_se, (int)media_ldr_sd, (int)media_ldr_ie,
               (int)media_ldr_id, cal_se, cal_sd, cal_ie, cal_id,
               estado_sistema, (int)angulo_atual_horiz, (int)angulo_atual_vert);
      } else {
        printf("DHT_ERR:%d S:%d:%d:%ld L:%d,%d,%d,%d LC:%d,%d,%d,%d M:%d | "
               "H:%d V:%d\n",
               erro_dht_safe, tensao_solar_mv, corrente_solar_ma,
               potencia_solar_mw, (int)media_ldr_se, (int)media_ldr_sd,
               (int)media_ldr_ie, (int)media_ldr_id, cal_se, cal_sd, cal_ie,
               cal_id, estado_sistema, (int)angulo_atual_horiz,
               (int)angulo_atual_vert);
      }
    }

    if (estado_sistema == ESTADO_PAUSE) {
      static uint32_t ultimo_aviso_pausa = 0;
      if (tempo_atual - ultimo_aviso_pausa >= 2000) {
        ultimo_aviso_pausa = tempo_atual;
        printf("STATUS:OFF\n");
      }
    }
  }
}