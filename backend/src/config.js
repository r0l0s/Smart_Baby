// Lee backend/.env y expone la configuración en un solo objeto.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(aqui, '..', '.env'), quiet: true });

const modoDemo = process.env.MODO_DEMO === 'true';

export const config = {
  port: Number(process.env.PORT || 3000),
  mqttPort: Number(process.env.MQTT_PORT || 1883),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  jwtSecret: process.env.JWT_SECRET || '',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramUsername: process.env.TELEGRAM_BOT_USERNAME || '',
  modoDemo,
  intervaloCunaSeg: modoDemo ? 10 : Number(process.env.INTERVALO_CUNA_SEG || 180),
};
