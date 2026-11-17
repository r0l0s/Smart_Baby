// Punto de entrada: API Express + broker MQTT + bot de Telegram.
import express from 'express';
import { config } from './config.js';
import { prepararStorage } from './db.js';
import { iniciarBroker } from './mqtt/broker.js';
import { iniciarBot, detenerBot } from './telegram/bot.js';
import { manejarErrores } from './middleware/errores.js';
import saludRouter from './routes/salud.js';

const app = express();
app.use(express.json());

app.use('/api/salud', saludRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(manejarErrores);

await iniciarBroker(config.mqttPort);
iniciarBot();
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
