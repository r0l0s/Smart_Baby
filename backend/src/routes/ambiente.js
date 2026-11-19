// Rutas del ambiente: perfiles e invitaciones (HU-PLA-08). Requieren sesión y siempre usan el
// ambiente del usuario (RNF-08).
import { Router } from 'express';
import QRCode from 'qrcode';
import { supabase } from '../db.js';
import {
  crearInvitacion,
  invitacionesPendientes,
  enlaceBot,
  PREFIJO_INVITACION,
} from '../services/tokensTelegram.js';

const router = Router();

// GET /api/ambiente/perfiles — perfiles del ambiente (CA3)
router.get('/perfiles', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, telefono, rol, verificado, creado_en')
      .eq('ambiente_id', req.usuario.ambiente_id)
      .order('creado_en');
    if (error) throw error;
    res.json(data.map((p) => ({ ...p, soy_yo: p.id === req.usuario.id })));
  } catch (err) {
    next(err);
  }
});

async function invitacionPublica(inv) {
  const enlace = enlaceBot(PREFIJO_INVITACION + inv.token);
  return { enlace, qr: await QRCode.toDataURL(enlace, { margin: 1, width: 220 }), expira_en: inv.expira_en, creado_en: inv.creado_en };
}

// GET /api/ambiente/invitaciones — invitaciones vigentes (sin usar y sin vencer)
router.get('/invitaciones', async (req, res, next) => {
  try {
    const lista = await invitacionesPendientes(req.usuario.ambiente_id);
    res.json(await Promise.all(lista.map(invitacionPublica)));
  } catch (err) {
    next(err);
  }
});

// POST /api/ambiente/invitaciones — genera un enlace de invitación al bot (CA1).
// Es de un solo uso y vence a las 24 horas (CA2; se aplica al aceptarla, HU-PLA-09).
router.post('/invitaciones', async (req, res, next) => {
  try {
    const inv = await crearInvitacion(req.usuario.ambiente_id);
    console.log(`[api] Invitación creada para el ambiente de ${req.usuario.nombre}`);
    res.status(201).json(await invitacionPublica({ ...inv, creado_en: new Date().toISOString() }));
  } catch (err) {
    next(err);
  }
});

export default router;
