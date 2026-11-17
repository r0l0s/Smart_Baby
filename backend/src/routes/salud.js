// GET /api/salud — muestra si cada parte del sistema está funcionando.
import { Router } from 'express';
import { estadoSupabase } from '../db.js';
import { estadoBot } from '../telegram/bot.js';
import { clientesConectados, estados } from '../mqtt/broker.js';

const router = Router();

router.get('/', async (req, res) => {
  const dispositivos = [...estados.entries()].map(([codigo, e]) => ({ codigo, tipo: e.tipo, online: e.online }));
  res.json({
    ok: true,
    hora: new Date().toISOString(),
    supabase: await estadoSupabase(),
    telegram: estadoBot(),
    mqtt: { clientesConectados: clientesConectados(), dispositivos },
  });
});

export default router;
