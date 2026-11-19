// Punto de entrada: API Express + broker MQTT + bot de Telegram.
import express from 'express';
import { config } from './config.js';
import { prepararStorage } from './db.js';
import { iniciarBroker } from './mqtt/broker.js';
import { iniciarBot, detenerBot } from './telegram/bot.js';
import { manejarErrores } from './middleware/errores.js';
import saludRouter from './routes/salud.js';
import authRouter from './routes/auth.js';
import notificacionesRouter from './routes/notificaciones.js';
import dispositivosRouter from './routes/dispositivos.js';
import iotRouter from './routes/iot.js';
import ambienteRouter from './routes/ambiente.js';
import { requiereSesion } from './middleware/auth.js';
import { iniciarConsultaPeriodica } from './services/cuna.js';
import { iniciarHorarios } from './services/horarioMatriz.js';

if (!config.jwtSecret) {
  console.error('[api] Falta JWT_SECRET en backend/.env — no se puede iniciar sesión sin él');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Rutas públicas
app.use('/api/salud', saludRouter);
app.use('/api/auth', authRouter); // registro y login son públicos; /yo exige sesión
app.use('/api/iot', iotRouter); // dispositivos: usan la clave X-Dispositivo-Clave, no JWT

// Todas las rutas siguientes exigen sesión (RNF-08)
app.use('/api/notificaciones', requiereSesion, notificacionesRouter);
app.use('/api/dispositivos', requiereSesion, dispositivosRouter);
app.use('/api/ambiente', requiereSesion, ambienteRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(manejarErrores);

await iniciarBroker(config.mqttPort);
iniciarBot();
iniciarConsultaPeriodica(); // cuna: pide datos cada INTERVALO_CUNA_SEG (10 s en demo)
iniciarHorarios(); // matriz: enciende y apaga según su horario diario
prepararStorage().catch((err) => console.error('[supabase]', err.message));

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] Backend escuchando en http://0.0.0.0:${config.port}`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.once(senal, () => {
    detenerBot(senal);
    process.exit(0);
  });
}
