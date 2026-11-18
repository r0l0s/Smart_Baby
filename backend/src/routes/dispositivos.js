// Rutas de dispositivos (HU-PLA-04, HU-PLA-05, HU-PLA-06). Todas exigen sesión y se
// limitan al ambiente del usuario (req.usuario.ambiente_id).
import { Router } from 'express';
import { supabase } from '../db.js';
import {
  TIPOS,
  esTipoValido,
  estadoEnVivo,
  dispositivoPublico,
  codigosVinculados,
  disponibles,
  nombrePorDefecto,
} from '../services/dispositivos.js';

const router = Router();

// GET /api/dispositivos — dispositivos del ambiente (botones de la pantalla principal)
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('dispositivos')
      .select('*')
      .eq('ambiente_id', req.usuario.ambiente_id)
      .order('creado_en');
    if (error) throw error;
    res.json(data.map(dispositivoPublico));
  } catch (err) {
    next(err);
  }
});

// GET /api/dispositivos/disponibles?tipo=cuna — dispositivos en línea y sin vincular de ese tipo
router.get('/disponibles', async (req, res, next) => {
  try {
    const tipo = String(req.query.tipo || '');
    if (!esTipoValido(tipo)) return res.status(400).json({ error: 'Tipo de dispositivo no válido' });
    res.json(await disponibles(tipo));
  } catch (err) {
    next(err);
  }
});

// POST /api/dispositivos  { codigo } — vincula un dispositivo al ambiente
router.post('/', async (req, res, next) => {
  try {
    const codigo = String(req.body?.codigo || '').trim();
    if (!codigo) return res.status(400).json({ error: 'Falta el código del dispositivo' });

    // CA4: la vinculación falla si el dispositivo no responde o ya pertenece a un ambiente
    const vivo = estadoEnVivo(codigo);
    if (!vivo?.online) {
      return res.status(409).json({ error: 'El dispositivo no está en línea. Revisa que esté encendido e intenta de nuevo.' });
    }
    if (!esTipoValido(vivo.tipo)) return res.status(409).json({ error: 'El dispositivo reporta un tipo desconocido' });
    if ((await codigosVinculados()).has(codigo)) {
      return res.status(409).json({ error: 'Este dispositivo ya está vinculado a un ambiente.' });
    }

    const { tipo: _t, online: _o, actualizado: _a, ...estado } = vivo;
    const { data, error } = await supabase
      .from('dispositivos')
      .insert({
        ambiente_id: req.usuario.ambiente_id,
        tipo: vivo.tipo,
        codigo,
        nombre: await nombrePorDefecto(req.usuario.ambiente_id, vivo.tipo),
        estado,
        configuracion: TIPOS[vivo.tipo].configuracion,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Este dispositivo ya está vinculado a un ambiente.' });
      throw error;
    }
    console.log(`[api] Dispositivo ${codigo} vinculado`);
    res.status(201).json(dispositivoPublico(data));
  } catch (err) {
    next(err);
  }
});

// GET /api/dispositivos/:id — un dispositivo del ambiente (pantalla dedicada)
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('dispositivos')
      .select('*')
      .eq('id', req.params.id)
      .eq('ambiente_id', req.usuario.ambiente_id)
      .maybeSingle();
    // 22P02 = el id no tiene formato uuid
    if (error && error.code !== '22P02') throw error;
    if (!data) return res.status(404).json({ error: 'Dispositivo no encontrado' });
    res.json(dispositivoPublico(data));
  } catch (err) {
    next(err);
  }
});

export default router;
