// Simulador: arranca los dispositivos simulados y el panel de control (puerto 4300).
import dotenv from 'dotenv';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { crearDispositivos } from './devices/index.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(aqui, '..', '.env'), quiet: true });

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const SIM_SETS = Number(process.env.SIM_SETS || 1);
const PANEL_PORT = Number(process.env.PANEL_PORT || 4300);

const dispositivos = crearDispositivos(SIM_SETS);
for (const d of dispositivos) d.conectar(MQTT_URL);
console.log(`[simulador] ${dispositivos.length} dispositivos conectándose a ${MQTT_URL}`);

// ---- Panel de control ----
const app = express();
app.use(express.json());
app.use(express.static(path.join(aqui, 'panel')));

app.get('/api/dispositivos', (req, res) => {
  res.json(dispositivos.map((d) => d.resumen()));
});

// POST /api/dispositivos/:codigo/energia  { encendido: true|false }
app.post('/api/dispositivos/:codigo/energia', (req, res) => {
  const d = dispositivos.find((x) => x.codigo === req.params.codigo);
  if (!d) return res.status(404).json({ error: 'No existe ese dispositivo' });
  if (req.body?.encendido) d.encender();
  else d.apagar();
  res.json({ ok: true });
});

// POST /api/dispositivos/:codigo/escenario  { escenario: "temp_alta" | "movimiento" | ... }
app.post('/api/dispositivos/:codigo/escenario', (req, res) => {
  const d = dispositivos.find((x) => x.codigo === req.params.codigo);
  if (!d) return res.status(404).json({ error: 'No existe ese dispositivo' });
  const mensaje = d.escenario(String(req.body?.escenario || ''));
  console.log(`[${d.codigo}] escenario "${req.body?.escenario}": ${mensaje}`);
  res.json({ mensaje });
});

app.listen(PANEL_PORT, '0.0.0.0', () => {
  console.log(`[simulador] Panel de control en http://localhost:${PANEL_PORT}`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, () => {
    for (const d of dispositivos) d.desconectar();
    process.exit(0);
  });
}
