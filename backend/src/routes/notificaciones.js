// Rutas de notificaciones (HU-TRN-03).
import { Router } from 'express';
import { supabase } from '../db.js';
import { formatearNotificacion, notificarAmbiente } from '../telegram/notificar.js';

const router = Router();

// POST /api/notificaciones/prueba — envía una notificación de prueba a todos los perfiles
// verificados del ambiente del usuario. Sirve para demostrar el canal antes de tener alertas reales.
router.post('/prueba', async (req, res, next) => {
  try {
    const { data: yo, error } = await supabase.from('usuarios').select('nombre').eq('id', req.usuario.id).single();
    if (error) throw error;

    const texto = formatearNotificacion({
      emoji: '🔔',
      dispositivo: 'Plataforma',
      evento: 'Notificación de prueba',
      valores: [`Enviada por: ${yo.nombre}`],
    });
    const resultado = await notificarAmbiente(req.usuario.ambiente_id, texto);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

export default router;
