# CLAUDE.md — Dispositivos Inteligentes para Bebés

Read this whole file before doing anything. It is the single source of truth for this repo.

## 1. Context

- University project (Tecnológico de Costa Rica, *Principios de Modelado en Ingeniería*). The professor plays the client. **The course grades project management (Scrum), not code quality** — deliver working, demoable features; do not over-engineer.
- The developer (me) is a beginner in web development, databases and testing, and has never built a web app before. After each task: explain briefly what you built, give the exact commands to run, and tell me how to test it by hand. Prefer simple, readable code over clever code.
- The full requirements are the user stories in Jira (project **PIPB**). Each story has acceptance criteria (CA) in "Dado que / cuando / entonces" form. **A story is done only when every CA is satisfied.** Read the story in Jira before implementing it.
- There is **no physical hardware**. All five WiFi devices are simulated by `simulator/`, which talks to the backend exactly like real ESP32 firmware would (MQTT + HTTP). The backend must not know or care that devices are simulated.
- All user-facing text (UI, validation messages, Telegram messages) is in **Spanish**. Code identifiers may use Spanish domain words (`dispositivo`, `lectura`, `ambiente`, `monitoreo`).

## 2. Stack (fixed by the Architecture Document — do not change without asking)

| Part | Technology |
|---|---|
| Frontend | Angular (latest, standalone components, Angular Router), Chart.js via `ng2-charts` + `chartjs-adapter-date-fns` |
| Backend | Node.js + Express, **JavaScript (ES modules)**, not TypeScript |
| Database | Supabase (PostgreSQL) + Supabase Storage (photos) |
| IoT messaging | MQTT, broker **embedded in the backend** with `aedes` (port 1883) |
| Notifications | Telegram Bot API with `telegraf`, **polling mode** (no webhook, works on a laptop) |
| Device simulator | Node.js script(s) using `mqtt` client + a tiny Express control panel |
| Auth | `bcrypt` password hashes + JWT (Bearer token stored in `localStorage`) |
| Scheduling | `node-cron` (matrix schedule, meal reminders, crib polling) |

## 3. Repository layout

```
/
├─ CLAUDE.md
├─ package.json          # root: "npm run dev" starts backend + frontend + simulator with `concurrently`
├─ .gitignore            # must ignore node_modules, .env, dist
├─ db/
│  └─ schema.sql         # full schema; I paste it into the Supabase SQL Editor
├─ backend/
│  ├─ .env.example
│  └─ src/
│     ├─ index.js        # Express app + starts MQTT broker + Telegram bot + cron jobs
│     ├─ config.js
│     ├─ db.js           # Supabase client (service role key)
│     ├─ mqtt/           # broker.js, handlers per device type
│     ├─ telegram/       # bot.js, notificar.js
│     ├─ routes/         # auth.js, ambiente.js, dispositivos.js, iot.js (photo upload), ...
│     ├─ services/       # business rules per module (cuna.js, colchon.js, ...)
│     └─ middleware/     # auth.js (JWT), errores.js
├─ frontend/             # Angular app
│  └─ proxy.conf.json    # proxies /api -> http://localhost:3000
└─ simulator/
   ├─ .env.example
   └─ src/
      ├─ index.js        # starts all simulated devices + control panel (port 4300)
      ├─ devices/        # cuna.js, colchon.js, matriz.js, seguridad.js, biberon.js
      └─ panel/          # static HTML page with buttons to trigger scenarios
```

Ports: frontend **4200**, backend **3000**, MQTT **1883**, simulator panel **4300**.

## 4. Non-negotiable rules

1. **Phone access over LAN.** The app is demoed by opening `http://<laptop-LAN-IP>:4200` on a phone.
   - Run Angular with `ng serve --host 0.0.0.0 --proxy-config proxy.conf.json`.
   - The frontend calls the backend **only with relative URLs** (`/api/...`). Never hard-code `localhost` in frontend code.
   - Backend listens on `0.0.0.0`.
2. **Secrets** live only in `backend/.env` (never committed, never sent to the browser — RNF-10). Provide `.env.example` with every key and a comment.
3. **The frontend never talks to Supabase directly.** Only the backend uses the Supabase client (service role key). Enable RLS on every table with no policies, so the anon key can read nothing.
4. **Passwords**: bcrypt hash, never plain text (RNF-06). Login errors never reveal which field failed (HU-PLA-03 CA2).
5. **Every route except register/login/verification-status requires a valid JWT**, and every query is scoped to the user's `ambiente_id` (RNF-08).
6. **Every reading and event is stored with a timestamp** (`timestamptz`, stored in UTC) and kept forever (HU-TRN-01). Display times in `America/Costa_Rica`, format `dd/MM/yyyy HH:mm`.
7. **All alerts and reminders go through Telegram** to *every verified profile* of the environment (HU-TRN-03). Message format: emoji + `[Dispositivo]` + event type + values + date/time.
8. Responsive UI (desktop, tablet, phone). Keep screens simple (RNF-15).
9. `npm run dev` from the repo root must start everything. Keep it working at all times.
10. Cross-platform: I may be on Windows. Use npm scripts, not bash-only commands.

## 5. Data model (`db/schema.sql`)

Use `uuid` primary keys (`gen_random_uuid()`) except high-volume tables (`bigint generated always as identity`).

- **ambientes**: `id`, `creado_en`.
- **usuarios**: `id`, `ambiente_id` → ambientes, `rol` (`'principal' | 'invitado'`), `nombre`, `telefono` (unique, normalized), `password_hash` (null for invitados), `telegram_chat_id` (bigint, null until verified), `verificado` (bool), `creado_en`.
  - **Guest login** (HU-PLA-03 CA3): a guest enters *their* phone + *the environment password*, which is the principal user's password. Compare against the principal's hash.
- **tokens_telegram**: `token` (random, unique), `tipo` (`'verificacion' | 'invitacion'`), `usuario_id` (for verificacion), `ambiente_id` (for invitacion), `expira_en`, `usado` (bool). Invitations: single use, 24 h (HU-PLA-08 CA2).
- **dispositivos**: `id`, `ambiente_id`, `tipo` (`'cuna' | 'colchon' | 'matriz' | 'seguridad' | 'biberon'`), `codigo` (unique device code used in MQTT topics, e.g. `cuna-01`), `nombre`, `estado` jsonb (last known state), `configuracion` jsonb (thresholds, options), `creado_en`.
- **monitoreos**: `id`, `dispositivo_id`, `inicio`, `fin` (null while active). Defines the chart X range (HU-TRN-02 CA2).
- **lecturas**: `id`, `dispositivo_id`, `monitoreo_id` (nullable), `tipo` (`'temperatura' | 'humedad' | 'movimiento' | 'peso' | 'temp_biberon'`), `valor` numeric, `unidad`, `registrado_en`. Index on `(dispositivo_id, tipo, registrado_en)`.
- **eventos**: `id`, `dispositivo_id`, `tipo` (e.g. `activacion`, `desactivacion`, `alerta_temperatura`, `alarma_decremento`, `movimiento`, `apertura_puerta`, ...), `detalle` jsonb, `foto_url` (nullable), `registrado_en`.
- **horarios_matriz** (Increment 2): `dispositivo_id` unique, `hora_inicio`, `duracion_min`, `velocidad`.
- **sesiones_alimentacion** (Increment 2): `id`, `dispositivo_id`, `inicio`, `duracion_seg`, `cantidad_ml`.
- **tiempos_comida** (Increment 2): `id`, `dispositivo_id`, `hora`.

Phone normalization: keep digits only; if 8 digits, prefix `506` (Costa Rica). Use the same function for registration, login and Telegram contact matching.

## 6. Device ↔ backend protocol (MQTT)

Topics (`{codigo}` = device code):

| Topic | Direction | Payload (JSON) |
|---|---|---|
| `dispositivos/{codigo}/estado` | device → backend, **retained**, with Last-Will `{online:false}` | `{ tipo, online, ...currentState }` |
| `dispositivos/{codigo}/lecturas` | device → backend | `{ tipo, valor, unidad, ts }` or batch `{ lecturas: [...] }` |
| `dispositivos/{codigo}/eventos` | device → backend | `{ tipo, detalle, ts }` |
| `dispositivos/{codigo}/comandos` | backend → device | `{ accion, ...params }` |

Photos (security device) use **HTTP POST** `multipart/form-data` to `POST /api/iot/{codigo}/fotos`; the backend uploads to the Supabase Storage bucket `fotos-seguridad` (create it at startup if missing) and creates the `movimiento` event with `foto_url`.

Two-way audio (HU-CUN-10, Increment 2) uses **WebSocket**. Note: the browser microphone needs a secure context (HTTPS or localhost) — solve in Increment 2 with a tunnel or deployment.

### Device behaviour (implemented in `simulator/`, mirrors the SRS)

- **Linking (HU-PLA-05)**: the simulator starts with one device of each type (`cuna-01`, `colchon-01`, `matriz-01`, `seguridad-01`, `biberon-01`; `SIM_SETS=2` creates `-02` too). Each publishes its retained `estado`. The "Agregar dispositivo" page: pick a type → backend lists **online, not-yet-linked** devices of that type → click "Vincular" → saved to `dispositivos`. Offline or already-linked → error, not added (CA4). ≤ 5 steps (RNF-15).
- **Cuna**: while monitoring is active, the device records motion detections with timestamps in a queue. The backend sends `{accion:"solicitar_datos"}` every `INTERVALO_CUNA_SEG` (180 s real, **10 s in demo mode**); the crib replies with temperature, humidity and **all queued motion detections**, then clears its queue (HU-CUN-02/03/06). Backend stores the readings, compares them with the thresholds (defaults 20–24 °C, 40–60 % — HU-CUN-04 CA1), and alerts on **every** out-of-range update (HU-CUN-05 CA3). Light (3 levels) and sounds are device state changed by commands; sounds and audio are mutually exclusive (Increment 2).
- **Colchón**: the **alarm logic runs on the device** (RNF-12, DA-6). On activation: 30 s countdown with no alarm → baseline weight → read every 1 s → if `|peso - base| / base >= 0.70` in **3 consecutive readings**, the local alarm sounds, stays on until monitoring is deactivated, and an `alarma_decremento` / `alarma_incremento` event is published. Weight readings are published every second. Backend stores and notifies.
- **Matriz LED**: on/off, speed `lenta|media|rapida`, changed instantly. The schedule is executed by the backend (Increment 2).
- **Seguridad**: when active, motion → POST photo (use sample JPGs in `simulator/assets/`) → backend event + Telegram alert **with the photo**. Door opening → MQTT event, no photo. Inactive → nothing is recorded (HU-SEG-01 CA3).
- **Biberón**: on `{accion:"medir"}` the device replies with `temp_biberon`. Backend classifies: `< 36` muy fría, `36–40` apta, `> 40` muy caliente; shows it and sends it by Telegram (HU-ALI-01).
- **Control panel** (`http://localhost:4300`): shows each simulated device's state (incl. "ALARMA SONANDO" for the mattress) and buttons to force scenarios: raise/lower crib temperature and humidity, crib motion, remove/drop weight on the mattress, room motion, open door, set bottle temperature (cold / ok / hot). This is how I demo the system.
- Simulated values drift realistically around normal values unless a scenario is forced.

## 7. Telegram flows

- **Verification (HU-PLA-02)**: after registration, create a `verificacion` token and show the link `https://t.me/<BOT_USERNAME>?start=<token>`. Bot `/start <token>` → asks the user to share their contact (reply keyboard with `request_contact`) → check that the contact belongs to the sender (`contact.user_id === from.id`) and that the normalized phone matches → set `telegram_chat_id` and `verificado = true`. Otherwise reject and explain. The web page polls `GET /api/auth/verificacion` until verified, then goes to the home screen. Unverified accounts get no notifications and see a reminder banner (CA4).
- **Invitation (HU-PLA-08/09)**: the Perfil screen generates `https://t.me/<BOT_USERNAME>?start=inv_<token>` (single use, expires in 24 h). The guest shares their contact → create `usuarios` row with `rol='invitado'`, their phone and chat id, `verificado = true`. Invalid or expired → the bot explains and nothing is created.
- `notificarAmbiente(ambienteId, texto, foto?)` sends to every verified profile. Never let a Telegram failure crash a request; log it.

## 8. Frontend screens

- `/registro`, `/verificacion`, `/login` (first visit with no session → `/registro`, with a link to login).
- `/` **Inicio**: buttons **Agregar dispositivo** and **Perfil**, plus one button per linked device; empty-state message if none (HU-PLA-04).
- `/agregar-dispositivo` (HU-PLA-05).
- `/dispositivo/:id`: header + back button, then controls and charts for that device type (HU-PLA-06). Poll the device's state and latest data every ~3 s while the screen is open (RNF-03).
- `/perfil` (Increment 2: edit data, invite, list of profiles).
- Charts: X axis = time (monitoring start → end, or now if active); Y axis labeled with the unit (HU-TRN-02). Motion: points over time.
- Logout button reachable from Inicio.

## 9. Sprint scope

**Increment 1 — Sprint "Incremento 1 (Sprint 3)", due Thursday 19 Nov 2026 (64 pts, all Alta):**
PIPB-9 HU-PLA-01 · PIPB-10 HU-PLA-02 · PIPB-11 HU-PLA-03 · PIPB-12 HU-PLA-04 · PIPB-13 HU-PLA-05 · PIPB-14 HU-PLA-06 · PIPB-18 HU-TRN-01 · PIPB-19 HU-TRN-02 · PIPB-20 HU-TRN-03 · PIPB-21 HU-CUN-01 · PIPB-22 HU-CUN-02 · PIPB-23 HU-CUN-03 · PIPB-25 HU-CUN-05 · PIPB-26 HU-CUN-06 · PIPB-31 HU-COL-01 · PIPB-32 HU-COL-02 · PIPB-33 HU-COL-03 · PIPB-39 HU-SEG-01 · PIPB-40 HU-SEG-02 · PIPB-41 HU-SEG-03 · PIPB-45 HU-ALI-01

**Increment 2 — Sprint "Incremento 2 (Sprint 4)" (52 pts):** all remaining Media/Baja stories (PLA-07/08/09, CUN-04/07/08/09/10, COL-04, MAT-01..04, SEG-04, TAB-01/02, ALI-02/03/04) + HTTPS/deployment. **Do not build Increment 2 stories unless I ask.**

Note: HU-TAB-01/02 (button board) is a standalone, battery-powered device with no connection to the platform. Its deliverable is C firmware for the ATmega328P (`firmware/tablero/`) plus, optionally, a small browser simulation — Increment 2.

Build order for Increment 1:
0. Scaffold (no story): repo layout, schema, `.env.example`, embedded broker, bot startup, simulator connecting, `npm run dev`.
1. PLA-01, PLA-03 (register, login, logout, JWT) → 2. PLA-02 + TRN-03 (Telegram verification + `notificarAmbiente`) → 3. PLA-04, PLA-05, PLA-06 (home, linking, device screen shell) → 4. TRN-01, TRN-02 (event/reading storage, reusable chart component) → 5. CUN-01, 02, 03, 05, 06 → 6. COL-01, 02, 03 → 7. SEG-01, 02, 03 → 8. ALI-01.

## 10. Jira workflow (Atlassian MCP)

- Site `proyecto-modelado.atlassian.net`, project **PIPB**. Statuses: To Do → In Progress → Done.
- When you **start** a story: read it in Jira (summary + CAs) and move it to **In Progress**.
- When **every CA passes** (you verified what you can; I confirm manual/Telegram checks): move it to **Done** and add a comment in Spanish: what was built, the files touched, and how each CA was verified.
- If you find a defect in a finished story, create a **Bug** in PIPB linked to the story.
- Do **not** change story points, priorities, sprints or acceptance criteria. If a CA seems impossible or contradictory, stop and ask me.
- If the Atlassian MCP is not connected, tell me and continue coding; list the Jira updates I should make by hand.

## 11. Git

- Commit after each story (or scaffold step) with the message `PIPB-<n> HU-XXX-NN: <short description>`.
- Never commit `.env` files or secrets.

## 12. How to verify your work

- Start everything with `npm run dev` and make sure all three processes start without errors.
- Test API endpoints with real requests (e.g. `curl` or a small script) and check the data landed in Supabase.
- Use the simulator panel to trigger scenarios and confirm events and readings are stored.
- Anything that needs my phone (Telegram) or my eyes (UI look): give me a manual test.

### Manual tests — write them for someone who has never tested a web app
I have no experience testing web applications. For every story, give me a checklist with **one test per acceptance criterion** (label them CA1, CA2, …). Each test must say:
1. **Setup** — what must be true first (e.g. "be logged out", "have the simulator running", "have the crib linked").
2. **Steps** — exact URL, exactly what to click or type, with example values to use.
3. **Expected result** — what I should see, and **where** to look: the website, Telegram on my phone, Supabase → Table Editor → `<table name>` (say which row/columns), the simulator panel (`http://localhost:4300`), or the terminal.
4. **If it fails** — what to copy back to you (terminal output, browser console via F12 → Console, a screenshot description).

Keep steps short, no jargon. If a step needs a tool I haven't used before, explain it in one sentence.
