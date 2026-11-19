# Dispositivos Inteligentes para Bebés

Plataforma web para monitorear dispositivos inteligentes para bebés: **cuna**, **colchón con sensor de peso**,
**sistema de seguridad**, **base de biberón** y **matriz LED**. Las alertas llegan por **Telegram**.

Proyecto del curso *Principios de Modelado en Ingeniería* — Tecnológico de Costa Rica.

> No hay hardware físico: los cinco dispositivos WiFi se **simulan** en `simulator/`, que se comunica con el
> backend exactamente como lo haría el firmware de un ESP32 (MQTT + HTTP). Un **panel de control** permite
> provocar escenarios (subir la temperatura, quitar al bebé del colchón, abrir la puerta…) durante la demostración.

---

## Contenido

1. [Arquitectura](#arquitectura)
2. [Requisitos](#requisitos)
3. [Instalación (una sola vez)](#instalación-una-sola-vez)
4. [Ejecutar](#ejecutar)
5. [Usar la aplicación](#usar-la-aplicación)
6. [Panel del simulador](#panel-del-simulador)
7. [Estructura del repositorio](#estructura-del-repositorio)
8. [Problemas comunes](#problemas-comunes)
9. [Estado del proyecto](#estado-del-proyecto)

---

## Arquitectura

```
 Navegador (PC o teléfono)            Backend (Node.js)                         Supabase
┌────────────────────────┐  /api   ┌──────────────────────────────┐        ┌──────────────────┐
│ Frontend Angular :4200 │ ──────► │ Express :3000  (API + JWT)   │ ─────► │ PostgreSQL       │
└────────────────────────┘ (proxy) │ Broker MQTT aedes :1883      │        │ Storage (fotos)  │
                                   │ Bot de Telegram (polling)    │        └──────────────────┘
                                   │ Tareas programadas (cron)    │ ─────► Telegram
                                   └──────────────────────────────┘
                                         ▲ MQTT            ▲ HTTP (fotos)
                                   ┌─────┴─────────────────┴──────┐
                                   │ Simulador de dispositivos     │
                                   │ + panel de control :4300      │
                                   └───────────────────────────────┘
```

| Parte | Tecnología |
|---|---|
| Frontend | Angular (componentes standalone), Chart.js con `ng2-charts` |
| Backend | Node.js + Express (JavaScript, módulos ES) |
| Base de datos | Supabase (PostgreSQL) + Supabase Storage para las fotos |
| Mensajería IoT | MQTT con broker `aedes` embebido en el backend |
| Notificaciones | Bot de Telegram con `telegraf` (modo *polling*, funciona en una laptop) |
| Autenticación | Contraseñas con `bcrypt` + JWT |
| Tareas periódicas | `node-cron` |

**Seguridad de datos:** el navegador nunca habla con Supabase; solo el backend usa la clave secreta.
Todas las tablas tienen RLS activado sin políticas, así que la clave pública no puede leer nada.

---

## Requisitos

- **Node.js 22.12 o superior** (probado con Node 26) — <https://nodejs.org>. Verifica con `node --version`.
- Una cuenta gratuita de **Supabase** — <https://supabase.com>
- **Telegram** en el teléfono, para crear el bot y recibir las alertas
- Funciona en Windows, macOS y Linux

---

## Instalación (una sola vez)

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/r0l0s/Smart_Baby.git
cd Smart_Baby
npm install
```

`npm install` en la raíz instala también `backend/`, `frontend/` y `simulator/`.

### 2. Crear la base de datos en Supabase

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor → New query**, pega **todo** el contenido de [`db/schema.sql`](db/schema.sql) y pulsa **Run**.
   Debe decir *"Success. No rows returned"*. (Se puede ejecutar varias veces sin problema.)
3. En **Table Editor** deben aparecer 10 tablas (`ambientes`, `usuarios`, `dispositivos`, `lecturas`, `eventos`, …).

El bucket de fotos `fotos-seguridad` lo crea el backend automáticamente la primera vez que arranca.

### 3. Crear el bot de Telegram

1. En Telegram, abre **@BotFather** y envía `/newbot`.
2. Elige un nombre y un usuario que termine en `bot`.
3. Guarda el **token** que te entrega y el **usuario** del bot (sin `@`).

### 4. Configurar `backend/.env`

Copia el archivo de ejemplo y complétalo:

```bash
# Windows (PowerShell)
Copy-Item backend/.env.example backend/.env
# macOS / Linux
cp backend/.env.example backend/.env
```

| Variable | De dónde sale |
|---|---|
| `SUPABASE_URL` | Supabase → *Project Settings → API Keys / Data API* (URL del proyecto) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → *API Keys* → **clave secreta** (`sb_secret_…` o `service_role`). **No** la pública. |
| `JWT_SECRET` | Un texto largo y aleatorio. Puedes generarlo con: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `TELEGRAM_BOT_TOKEN` | El token de @BotFather |
| `TELEGRAM_BOT_USERNAME` | El usuario del bot, sin `@` |
| `MODO_DEMO` | `true` = la cuna envía datos cada 10 s (para presentar). `false` = cada 3 min (real) |
| `IOT_CLAVE` | Clave que usan los dispositivos para subir fotos. Debe ser igual en el simulador. |

El simulador funciona sin configuración. Si necesitas cambiar algo, copia `simulator/.env.example`
a `simulator/.env` (por ejemplo `SIM_SETS=2` crea un segundo juego de dispositivos: `cuna-02`, `colchon-02`, …).

> ⚠️ Los archivos `.env` contienen secretos: **nunca** se suben a Git (ya están en `.gitignore`).

---

## Ejecutar

```bash
npm run dev
```

Esto inicia los tres procesos a la vez (con etiquetas de color en la terminal):

| Proceso | Dirección |
|---|---|
| Frontend | <http://localhost:4200> |
| Backend (API) | <http://localhost:3000> · broker MQTT en el puerto `1883` |
| Simulador (panel) | <http://localhost:4300> |

Para detener todo: **Ctrl + C**.

**Comprobar que todo funciona:** abre <http://localhost:4200/estado>. Supabase y Telegram deben decir **ok**
y los cinco dispositivos simulados deben aparecer **en línea**.

### Desde el teléfono

1. Conecta el teléfono a la **misma red WiFi** que la computadora.
2. Averigua la IP de la computadora (Windows: `ipconfig` → *Dirección IPv4*; macOS/Linux: `ifconfig` o `ip a`).
3. En el teléfono abre `http://<IP-de-la-computadora>:4200`.

En Windows, si no carga, permite Node.js en el firewall: *Inicio → "Permitir una aplicación a través del Firewall
de Windows" → Node.js JavaScript Runtime → marcar **Privada***.

---

## Usar la aplicación

1. **Registro** (`/registro`): nombre, teléfono (el mismo de Telegram) y contraseña (mín. 8 caracteres).
   Cada cuenta crea su propio *ambiente*.
2. **Verificación con Telegram**: pulsa *Abrir Telegram* (o escanea el QR con el teléfono), toca **Iniciar** y luego
   **📱 Compartir mi número**. La página pasa sola a la pantalla principal. Sin verificar no se reciben alertas.
3. **Agregar dispositivo**: elige el tipo → aparecen los dispositivos en línea sin vincular → **Vincular**.
4. Cada dispositivo tiene su pantalla con controles, gráficas e historial de eventos:

| Dispositivo | Qué hace |
|---|---|
| 🛏️ **Cuna** | Monitoreo de temperatura, humedad y movimiento con gráficas. Alerta si la temperatura o la humedad salen de los **rangos configurables** (por defecto 20–24 °C y 40–60 %). Notificación opcional por cada movimiento. **Luz de noche** (3 niveles), **5 sonidos pregrabados** y **comunicación con el bebé** (inicio y fin de la llamada; el canal de audio queda para el siguiente sprint). |
| ⚖️ **Colchón** | Al activar: cuenta regresiva de 30 s → peso base → lectura cada segundo. Si el peso cambia ≥ 70 % durante 3 lecturas seguidas, suena la alarma (hasta desactivar) y llega una alerta. Historial cronológico de activaciones y alarmas. |
| 📷 **Sistema de seguridad** | Con la vigilancia activa: movimiento → foto + alerta con la foto; apertura de puerta → alerta. Historial cronológico con las fotos. |
| 🍼 **Base de biberón** | Botón *Tomar temperatura*: muy fría (< 36 °C), apta (36–40 °C) o muy caliente (> 40 °C), en pantalla y por Telegram. **Sesiones de alimentación** cronometradas con la cantidad en ml, **gráficas** de cantidad y duración, y **tiempos de comida** diarios con recordatorio por Telegram. |
| 💡 **Matriz LED** | Encender y apagar, 3 velocidades y **vista en tiempo real** del patrón 8×8. **Horario diario** (hora de inicio, duración y velocidad) que se puede modificar o eliminar; el control manual prevalece sobre el horario. |

Cualquier dispositivo se puede **eliminar del ambiente** desde su pantalla (su historial se conserva) y volver a agregar.

**Perfil**: editar nombre y teléfono (un teléfono nuevo pide verificar de nuevo), cambiar la contraseña del ambiente
(solo el usuario principal), ver los perfiles del ambiente e **invitar familiares**: se genera un enlace al bot de
Telegram, de un solo uso y válido por 24 horas. El invitado comparte su contacto con el bot y queda agregado.
Los **invitados** inician sesión con *su* teléfono y la contraseña del ambiente, y tienen los mismos permisos
sobre los dispositivos.

---

## Panel del simulador

<http://localhost:4300> muestra el estado interno de cada dispositivo simulado y botones para provocar escenarios:

| Dispositivo | Botones |
|---|---|
| Todos | **⏻ Apagar / 🔌 Encender** (simula desconectarlo) |
| Cuna | Subir / bajar / normalizar temperatura y humedad · **🏃 Movimiento** · **💡 Botón de luz** y **🔆 Botón de intensidad** (los botones físicos de la cuna) |
| Colchón | **Quitar bebé** · **Dejar caer objeto (+4 kg)** · **Golpe de 1 s** (no debe sonar la alarma) · **Bebé normal** |
| Seguridad | **Movimiento en el cuarto** (toma y envía una foto) · **Abrir puerta** |
| Biberón | Leche **fría** (~30 °C) · **apta** (~38 °C) · **caliente** (~45 °C) |
| Matriz LED | Muestra en vivo el patrón 8×8 que está mostrando la matriz |

- **Sonidos de la cuna:** pulsa **🔇 Escuchar en este equipo los sonidos de la cuna** (arriba del panel) y el equipo
  reproducirá lo que la cuna está sonando. En iPad/iPhone el **modo silencio** debe estar apagado.
- La cámara simulada usa las imágenes `.jpg` / `.png` que pongas en `simulator/assets/`; si no hay, dibuja una foto
  estilo visión nocturna con la hora.
- El panel se puede abrir desde otro equipo de la misma red (por ejemplo una tablet) con `http://<IP-de-la-computadora>:4300`.

---

## Estructura del repositorio

```
├─ package.json          # "npm run dev" inicia backend + frontend + simulador
├─ db/schema.sql         # esquema completo de la base de datos (pegar en Supabase)
├─ backend/
│  ├─ .env.example
│  └─ src/
│     ├─ index.js        # Express + broker MQTT + bot + tareas programadas
│     ├─ mqtt/           # broker y manejo de mensajes de los dispositivos
│     ├─ telegram/       # bot (verificación) y envío de notificaciones
│     ├─ routes/         # auth, dispositivos, notificaciones, iot (fotos), salud
│     ├─ services/       # reglas de cada dispositivo (cuna, colchon, seguridad, biberon…)
│     └─ middleware/     # JWT y manejo de errores
├─ frontend/             # aplicación Angular (proxy /api → backend en proxy.conf.json)
└─ simulator/
   ├─ assets/            # fotos opcionales para la cámara simulada
   └─ src/
      ├─ devices/        # cuna, colchón, matriz, seguridad, biberón
      └─ panel/          # página del panel de control
```

### Protocolo dispositivo ↔ backend (MQTT)

| Tópico | Dirección | Contenido |
|---|---|---|
| `dispositivos/{codigo}/estado` | dispositivo → backend (retenido, con *Last-Will* `online:false`) | `{ tipo, online, … }` |
| `dispositivos/{codigo}/lecturas` | dispositivo → backend | `{ tipo, valor, unidad, ts }` o `{ lecturas: [...] }` |
| `dispositivos/{codigo}/eventos` | dispositivo → backend | `{ tipo, detalle, ts }` |
| `dispositivos/{codigo}/comandos` | backend → dispositivo | `{ accion, … }` |

Las fotos del sistema de seguridad se envían por HTTP: `POST /api/iot/{codigo}/fotos` (multipart, campo `foto`,
encabezado `X-Dispositivo-Clave`).

---

## Problemas comunes

| Síntoma | Solución |
|---|---|
| `/estado` dice *Supabase: sin configurar* | Falta `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` en `backend/.env`. Reinicia `npm run dev`. |
| *error: faltan las tablas* | Ejecuta `db/schema.sql` en el SQL Editor de Supabase. |
| *Telegram: sin configurar* | Falta `TELEGRAM_BOT_TOKEN` en `backend/.env`. |
| El bot dice que el número no coincide | Regístrate con el mismo número que usa tu cuenta de Telegram. |
| `EADDRINUSE` al iniciar | Ya hay otra copia corriendo (o algo usa los puertos 3000, 1883, 4200 o 4300). Ciérrala. |
| No carga desde el teléfono | Misma red WiFi, IP correcta y permiso del firewall (ver [Desde el teléfono](#desde-el-teléfono)). |
| Los dispositivos aparecen *fuera de línea* | Revisa que el simulador esté corriendo y que no los hayas apagado desde el panel. |
| `409: Conflict` del bot de Telegram en la terminal | Hay **otra copia del backend** usando el mismo bot (por ejemplo en otra computadora). Solo puede correr una a la vez. |
| Los teléfonos no abren la página en la red de la universidad | Muchas redes públicas aíslan a los equipos entre sí. Usa el *hotspot* de un teléfono para la computadora, la tablet y los teléfonos. |

---

## Estado del proyecto

Gestión con Scrum en Jira (proyecto **PIPB**).

- ✅ **Incremento 1** (21 historias de prioridad Alta): registro, verificación por Telegram, sesión, pantalla
  principal, vinculación de dispositivos, registro de eventos, gráficas, notificaciones, cuna, colchón, sistema
  de seguridad y temperatura del biberón.
- ✅ **Incremento 2** (adelanto): gestión de la cuenta, invitaciones y perfiles; umbrales configurables, notificación
  de movimiento, luz de noche y sonidos de la cuna; historiales del colchón y de seguridad; matriz LED con vista en
  vivo y horario; sesiones de alimentación, gráficas y recordatorios. Además: eliminar dispositivos del ambiente.
- ⏳ **Pendiente**: audio bidireccional con la cuna (HU-CUN-10, siguiente sprint, requiere HTTPS), tablero de botones
  (HU-TAB-01/02, hecho por el equipo en el juguete físico) e integración con el hardware real.
