import tkinter as tk
from tkinter import scrolledtext
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
import threading, queue, time, re, asyncio, httpx, os, sys, ctypes
from bleak import BleakScanner, BleakClient

URL_THINGSPEAK = "https://api.thingspeak.com/update"
API_KEY = os.environ.get("THINGSPEAK_WRITE_KEY", "")
NOME_DISPOSITIVO, UUID_CARAT = "HC-05", "0000ffe1-0000-1000-8000-00805f9b34fb"

executando, thread_trabalho, widgets = False, None, {}
fila_log = queue.Queue()
fila_cmd = queue.Queue()
modo_manual_ativo = False

def resource_path(relative_path):
    """ Obtém o caminho absoluto para o recurso, funciona para dev e para PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

async def enviar_cloud(dados, cliente_http):
    try:
        res = await cliente_http.post(URL_THINGSPEAK, data=dados, timeout=5.0)
        msg = "Enviado para o ThingSpeak com sucesso" if res.text != "0" else "Aviso: ThingSpeak rejeitou."
        fila_log.put(("log", msg))
        if res.text != "0": fila_log.put(("status", ("A Correr", SUCCESS)))
    except Exception as e: fila_log.put(("log", f"Erro Net: {e}"))

async def loop_ble():
    global executando
    fila_dados, evento_desc, ult_envio = asyncio.Queue(), asyncio.Event(), time.time() - 15.0

    def ao_desconectar(_):
        if executando: 
            fila_log.put(("log", ">> Desconectado."))
            fila_log.put(("btn_modo_state", DISABLED))
            evento_desc.set()
    
    def ao_receber(_, d):
        try: fila_dados.put_nowait(d.decode('utf-8', errors='ignore'))
        except: pass

    dev = await BleakScanner.find_device_by_name(NOME_DISPOSITIVO, timeout=10.0)
    if not dev: return fila_log.put(("log", f"'{NOME_DISPOSITIVO}' não encontrado."))
    
    fila_log.put(("log", f"Encontrado! A conectar a {dev.address}..."))
    
    async with httpx.AsyncClient() as http:
        client = BleakClient(dev, disconnected_callback=ao_desconectar)
        try:
            await asyncio.wait_for(client.connect(), timeout=30.0)
            
            if not client.is_connected: return fila_log.put(("log", "Falha ao conectar."))
            
            fila_log.put(("log", "A aguardar emparelhamento"))
            await client.start_notify(UUID_CARAT, ao_receber)
            
            fila_log.put(("status", ("Ligado", SUCCESS)))
            fila_log.put(("btn_modo_state", NORMAL)) 
            
            buff = ""
            while executando and not evento_desc.is_set():
                try:
                    chunk = await asyncio.wait_for(fila_dados.get(), timeout=0.1)
                    buff += chunk
                    if len(buff) > 2048: buff = ""
                    while '\n' in buff:
                        linha, buff = buff.split('\n', 1)
                        if not linha.strip(): continue
                        fila_log.put(("log", f"RX: {linha.strip()}"))
                        
                        if "STATUS:OFF" in linha:
                            fila_log.put(("btn_modo_state", DISABLED))
                            fila_log.put(("status", ("Suspenso", SECONDARY)))
                            fila_log.put(("log", ">> SISTEMA SUSPENSO (Botão Físico)"))
                        elif "STATUS:ON" in linha:
                            fila_log.put(("btn_modo_state", NORMAL))
                            fila_log.put(("status", ("Ligado", SUCCESS)))
                            fila_log.put(("log", ">> SISTEMA REATIVADO"))
                        
                        m = re.search(r'T:([\d\.-]+)\s+H:([\d\.-]+)\s+L:(\d+),(\d+),(\d+),(\d+)\s+LC:(\d+),(\d+),(\d+),(\d+)\s+\|\s+H:(\d+)\s+V:(\d+)', linha)
                        if m:
                            vals = {
                                'T': float(m.group(1)), 
                                'H': float(m.group(2)), 
                                'LDR': [int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6))],
                                'LDR_CAL': [int(m.group(7)), int(m.group(8)), int(m.group(9)), int(m.group(10))],
                                'AH': int(m.group(11)), 
                                'AV': int(m.group(12))
                            }
                            fila_log.put(("dados", vals))
                            
                            if time.time() - ult_envio >= 15.0:
                                asyncio.create_task(enviar_cloud({
                                    'api_key': API_KEY, 
                                    'field1': vals['T'], 'field2': vals['H'], 
                                    'field3': vals['AH'], 'field4': vals['AV']
                                }, http))
                                ult_envio = time.time()
                except asyncio.TimeoutError: pass
                
                while not fila_cmd.empty():
                    cmd = fila_cmd.get_nowait()
                    try:
                        await client.write_gatt_char(UUID_CARAT, cmd.encode())
                        fila_log.put(("log", f"TX: {cmd}"))
                    except Exception as e: fila_log.put(("log", f"Erro TX: {e}"))

        except asyncio.TimeoutError: fila_log.put(("log", "Erro: Timeout conexão (30s)."))
        except Exception as e: fila_log.put(("log", f"Erro: {e}"))
        finally:
            if client:
                try: await client.unpair(); await client.disconnect()
                except: pass
    fila_log.put(("status", ("A Reiniciar...", WARNING)))
    fila_log.put(("btn_modo_state", DISABLED))

def thread_gestor():
    fila_log.put(("log", "=== SISTEMA INICIADO ==="))
    time.sleep(2)
    while executando:
        fila_log.put(("status", ("A Procurar...", INFO)))
        try: asyncio.run(loop_ble())
        except Exception as e: fila_log.put(("log", f"Erro Fatal: {e}"))
        if executando: time.sleep(3)
    fila_log.put(("log", "Monitorização Parada."))
    fila_log.put(("status", ("Parado", SECONDARY)))

def alternar_modo():
    global modo_manual_ativo
    modo_manual_ativo = not modo_manual_ativo
    if modo_manual_ativo:
        widgets['btn_modo'].config(text="Modo: MANUAL", bootstyle=WARNING)
        widgets['root'].bind('<Left>', lambda e: enviar_tecla('E'))
        widgets['root'].bind('<Right>', lambda e: enviar_tecla('D'))
        widgets['root'].bind('<Up>', lambda e: enviar_tecla('C'))
        widgets['root'].bind('<Down>', lambda e: enviar_tecla('B'))
        fila_cmd.put('M')
        fila_log.put(("log", ">> MODO MANUAL ATIVADO (Setas ativas)"))
    else:
        widgets['btn_modo'].config(text="Modo: AUTO", bootstyle=INFO)
        widgets['root'].unbind('<Left>'); widgets['root'].unbind('<Right>')
        widgets['root'].unbind('<Up>'); widgets['root'].unbind('<Down>')
        fila_cmd.put('A')
        fila_log.put(("log", ">> MODO AUTOMÁTICO ATIVADO"))

def enviar_tecla(char_cmd):
    if executando and modo_manual_ativo: fila_cmd.put(char_cmd)

def iniciar():
    global executando, thread_trabalho
    if not executando:
        executando = True
        thread_trabalho = threading.Thread(target=thread_gestor, daemon=True)
        thread_trabalho.start()
        widgets['btn_ini'].config(state=DISABLED); widgets['btn_par'].config(state=NORMAL)

def parar():
    global executando
    executando = False
    widgets['btn_ini'].config(state=NORMAL); widgets['btn_par'].config(state=DISABLED)
    widgets['btn_modo'].config(state=DISABLED)
    fila_log.put(("log", "A parar processos..."))

def limpar_log():
    widgets['log'].config(state=NORMAL)
    widgets['log'].delete('1.0', tk.END)
    widgets['log'].config(state=DISABLED)

def processar_gui():
    try:
        while True:
            tipo, dado = fila_log.get_nowait()
            if tipo == "log":
                widgets['log'].config(state=NORMAL)
                widgets['log'].insert(tk.END, dado + "\n"); widgets['log'].see(tk.END)
                widgets['log'].config(state=DISABLED)
            elif tipo == "status": 
                widgets['status'].config(text=dado[0], bootstyle=(dado[1], INVERSE))
            elif tipo == "btn_modo_state":
                widgets['btn_modo'].config(state=dado)
            elif tipo == "dados":
                widgets['v_temp'].config(text=f"{dado['T']:.1f} °C"); widgets['v_hum'].config(text=f"{dado['H']:.1f} %")
                widgets['v_ah'].config(text=f"{dado['AH']} °"); widgets['v_av'].config(text=f"{dado['AV']} °")
                ldrs = dado['LDR']
                ldrs_cal = dado['LDR_CAL']
                sensores = ['se', 'sd', 'ie', 'id']
                for i, s in enumerate(sensores):
                    widgets[f'v_ldr_{s}'].config(text=f"{ldrs[i]}")
                    widgets[f'v_cal_{s}'].config(text=f"{ldrs_cal[i]}")

    except queue.Empty: pass
    widgets['root'].after(100, processar_gui)

if __name__ == "__main__":
    myappid = 'isep.labsi.solartracker.v2' 
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
    except Exception:
        pass

    root = ttk.Window(themename='litera')
    root.title("Ponte Seguidor Solar v2.2")
    root.geometry("900x850") 
    
    try:
        icon_path = resource_path(os.path.join("assets", "Logo_solar_tracker.ico"))
        root.iconbitmap(icon_path)
    except Exception as e:
        print(f"Aviso: Não foi possível carregar o ícone: {e}")

    widgets['root'] = root
    
    painel = ttk.Frame(root, padding=10); painel.pack(fill=BOTH, expand=YES)
    ttk.Label(painel, text="SEGUIDOR SOLAR - IOT", font=("Roboto", 18, "bold"), bootstyle=PRIMARY).pack(pady=10)
    
    frm = ttk.Frame(painel); frm.pack(fill=X, pady=5)
    widgets['btn_ini'] = ttk.Button(frm, text="Iniciar", command=iniciar, bootstyle=SUCCESS, width=12)
    widgets['btn_ini'].pack(side=LEFT, padx=2)
    widgets['btn_par'] = ttk.Button(frm, text="Parar", command=parar, bootstyle=DANGER, state=DISABLED, width=12)
    widgets['btn_par'].pack(side=LEFT, padx=2)
    widgets['btn_modo'] = ttk.Button(frm, text="Modo: AUTO", command=alternar_modo, bootstyle=INFO, state=DISABLED, width=15)
    widgets['btn_modo'].pack(side=LEFT, padx=20)
    ttk.Button(frm, text="Limpar Log", command=limpar_log, bootstyle=SECONDARY).pack(side=RIGHT)

    frm_d = ttk.Frame(painel); frm_d.pack(fill=X, pady=10)
    for k, t in [('v_temp','Temperatura'), ('v_hum','Humidade'), ('v_ah','Âng. Horiz.'), ('v_av','Âng. Vert.')]:
        lf = ttk.Labelframe(frm_d, text=t, width=150, height=80); lf.pack(side=LEFT, fill=X, expand=True, padx=2); lf.pack_propagate(False)
        widgets[k] = ttk.Label(lf, text="--", font=("Helvetica", 14, "bold"), bootstyle=PRIMARY, anchor=CENTER); widgets[k].pack(expand=True)
    
    ttk.Label(painel, text="Sensores de Luz - Valores Brutos (0-1023)", font=("Roboto", 10, "bold"), bootstyle=DARK).pack(pady=(15,0), anchor=W)
    frm_ldr_raw = ttk.Frame(painel); frm_ldr_raw.pack(fill=X, pady=5)
    
    sensores_labels = [('se', 'Sup. Esq.'), ('sd', 'Sup. Dir.'), ('ie', 'Inf. Esq.'), ('id', 'Inf. Dir.')]
    
    for key_suffix, label_text in sensores_labels:
        lf = ttk.Labelframe(frm_ldr_raw, text=label_text, width=150, height=70)
        lf.pack(side=LEFT, fill=X, expand=True, padx=2); lf.pack_propagate(False)
        widgets[f'v_ldr_{key_suffix}'] = ttk.Label(lf, text="--", font=("Consolas", 12), bootstyle=SECONDARY, anchor=CENTER)
        widgets[f'v_ldr_{key_suffix}'].pack(expand=True)

    ttk.Label(painel, text="Sensores de Luz - Pós Calibração (Lógica de Controlo)", font=("Roboto", 10, "bold"), bootstyle=DARK).pack(pady=(10,0), anchor=W)
    frm_ldr_cal = ttk.Frame(painel); frm_ldr_cal.pack(fill=X, pady=5)
    
    for key_suffix, label_text in sensores_labels:
        lf = ttk.Labelframe(frm_ldr_cal, text=label_text, width=150, height=70)
        lf.pack(side=LEFT, fill=X, expand=True, padx=2); lf.pack_propagate(False)
        widgets[f'v_cal_{key_suffix}'] = ttk.Label(lf, text="--", font=("Consolas", 12, "bold"), bootstyle=WARNING, anchor=CENTER)
        widgets[f'v_cal_{key_suffix}'].pack(expand=True)

    widgets['log'] = scrolledtext.ScrolledText(painel, state=DISABLED, font=("Consolas", 9), height=10); widgets['log'].pack(fill=BOTH, expand=True, pady=10)
    widgets['status'] = ttk.Label(root, text="Parado", bootstyle=(DEFAULT, INVERSE), padding=5); widgets['status'].pack(side=BOTTOM, fill=X)
    
    root.protocol("WM_DELETE_WINDOW", lambda: (parar(), root.destroy())); root.after(100, processar_gui); root.mainloop()