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
import { olvidarDispositivo, monitoreoActivo, finalizarMonitoreo, guardarEvento } from '../services/registro.js';
import { enviarComando } from '../mqtt/broker.js';
import * as cuna from '../services/cuna.js';
import * as colchon from '../services/colchon.js';
import * as seguridad from '../services/seguridad.js';
import * as biberon from '../services/biberon.js';
import { config } from '../config.js';

const router = Router();

// GET /api/dispositivos — dispositivos del ambiente (botones de la pantalla principal)
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('dispositivos')
      .select('*')
      .eq('ambiente_id', req.usuario.ambiente_id)
      .is('eliminado_en', null)
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
    olvidarDispositivo(codigo); // para que sus lecturas se guarden de inmediato
    console.log(`[api] Dispositivo ${codigo} vinculado`);
    res.status(201).json(dispositivoPublico(data));
  } catch (err) {
    next(err);
  }
});

// Busca el dispositivo :id SOLO dentro del ambiente del usuario. Si no existe, responde 404
// y devuelve null.
async function dispositivoDelAmbiente(req, res) {
  const { data, error } = await supabase
    .from('dispositivos')
    .select('*')
    .eq('id', req.params.id)
    .eq('ambiente_id', req.usuario.ambiente_id)
    .is('eliminado_en', null)
    .maybeSingle();
  // 22P02 = el id no tiene formato uuid
  if (error && error.code !== '22P02') throw error;
  if (!data) res.status(404).json({ error: 'Dispositivo no encontrado' });
  return data;
}

// DELETE /api/dispositivos/:id — quita el dispositivo del ambiente (solo el usuario principal).
// No se borra la fila: se marca eliminado_en para conservar lecturas y eventos (HU-TRN-01 CA2).
// Después, el dispositivo queda libre para vincularse de nuevo.
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.usuario.rol !== 'principal') {
      return res.status(403).json({ error: 'Solo el usuario principal puede eliminar dispositivos' });
    }
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;

    // Si tenía un monitoreo abierto, se cierra y se le ordena al dispositivo detenerse.
    const monitoreo = await finalizarMonitoreo(d.id);
    if (monitoreo) enviarComando(d.codigo, { accion: 'desactivar_monitoreo' });

    await guardarEvento(d, {
      tipo: 'eliminacion',
      detalle: { mensaje: `Dispositivo eliminado del ambiente por ${req.usuario.nombre}` },
    });
    const { error } = await supabase
      .from('dispositivos')
      .update({ eliminado_en: new Date().toISOString() })
      .eq('id', d.id);
    if (error) throw error;
    olvidarDispositivo(d.codigo); // deja de guardar sus lecturas de inmediato
    console.log(`[api] Dispositivo ${d.codigo} eliminado del ambiente`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/dispositivos/:id — un dispositivo del ambiente (pantalla dedicada).
// Incluye el monitoreo activo (o null) y cada cuántos segundos se actualizan los datos.
router.get('/:id', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    res.json({
      ...dispositivoPublico(d),
      monitoreo: await monitoreoActivo(d.id),
      intervalo_seg: config.intervaloCunaSeg,
      ...(d.tipo === 'biberon' && { ultima_medicion: await biberon.ultimaMedicion(d.id) }),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/dispositivos/:id/umbrales  { temp_min, temp_max, hum_min, hum_max }   (HU-CUN-04)
// Guarda los rangos de alerta de la cuna. Se aplican desde la siguiente medición (CA2).
const LIMITES_UMBRALES = {
  temp: { nombre: 'temperatura', unidad: '°C', min: 0, max: 50 },
  hum: { nombre: 'humedad', unidad: '%', min: 0, max: 100 },
};
router.put('/:id/umbrales', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    if (d.tipo !== 'cuna') return res.status(400).json({ error: 'Solo la cuna tiene umbrales de temperatura y humedad' });

    const nuevos = {};
    for (const [prefijo, l] of Object.entries(LIMITES_UMBRALES)) {
      const min = Number(req.body?.[`${prefijo}_min`]);
      const max = Number(req.body?.[`${prefijo}_max`]);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return res.status(400).json({ error: `Ingresa el mínimo y el máximo de ${l.nombre}`, campo: prefijo });
      }
      if (min < l.min || max > l.max) {
        return res.status(400).json({ error: `Los valores de ${l.nombre} deben estar entre ${l.min} y ${l.max} ${l.unidad}`, campo: prefijo });
      }
      // CA3: el mínimo debe ser menor que el máximo
      if (min >= max) {
        return res.status(400).json({ error: `El mínimo de ${l.nombre} debe ser menor que el máximo`, campo: prefijo });
      }
      nuevos[`${prefijo}_min`] = min;
      nuevos[`${prefijo}_max`] = max;
    }

    const configuracion = { ...d.configuracion, ...nuevos };
    const { error } = await supabase.from('dispositivos').update({ configuracion }).eq('id', d.id);
    if (error) throw error;
    olvidarDispositivo(d.codigo); // la próxima lectura ya usa los nuevos umbrales
    await guardarEvento(d, {
      tipo: 'configuracion',
      detalle: {
        mensaje: `Rangos de alerta actualizados por ${req.usuario.nombre}: ${nuevos.temp_min}–${nuevos.temp_max} °C y ${nuevos.hum_min}–${nuevos.hum_max} %`,
        ...nuevos,
      },
    });
    res.json({ configuracion });
  } catch (err) {
    next(err);
  }
});

// POST /api/dispositivos/:id/medir — base de biberón: medir la temperatura de la leche (HU-ALI-01)
router.post('/:id/medir', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    if (d.tipo !== 'biberon') return res.status(400).json({ error: 'Este dispositivo no mide temperatura de biberón' });
    if (!estadoEnVivo(d.codigo)?.online) {
      return res.status(409).json({ error: 'La base de biberón está fuera de línea. Revisa que esté encendida.' });
    }
    res.json(await biberon.medir(d));
  } catch (err) {
    next(err);
  }
});

// Servicios que saben activar/desactivar el monitoreo de cada tipo de dispositivo.
const MONITOREO = { cuna, colchon, seguridad };

// POST /api/dispositivos/:id/monitoreo  { activo: true|false }  (HU-CUN-01)
router.post('/:id/monitoreo', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    const servicio = MONITOREO[d.tipo];
    if (!servicio) return res.status(400).json({ error: 'Este dispositivo no tiene monitoreo' });
    const activar = req.body?.activo === true;

    if (activar && !estadoEnVivo(d.codigo)?.online) {
      return res.status(409).json({ error: 'El dispositivo está fuera de línea. Revisa que esté encendido.' });
    }
    const monitoreo = activar
      ? await servicio.activarMonitoreo(d, req.usuario)
      : await servicio.desactivarMonitoreo(d, req.usuario);
    res.json({ monitoreo: activar ? monitoreo : null });
  } catch (err) {
    next(err);
  }
});

// GET /api/dispositivos/:id/monitoreos — historial de monitoreos, el más reciente primero
router.get('/:id/monitoreos', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    const limite = Math.min(Number(req.query.limite) || 20, 100);
    const { data, error } = await supabase
      .from('monitoreos')
      .select('id, inicio, fin')
      .eq('dispositivo_id', d.id)
      .order('inicio', { ascending: false })
      .limit(limite);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dispositivos/:id/lecturas?tipo=temperatura&monitoreo=<id>
//   o bien ?tipo=...&desde=<fecha ISO>&hasta=<fecha ISO>   (HU-TRN-02)
router.get('/:id/lecturas', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    let consulta = supabase
      .from('lecturas')
      .select('valor, unidad, registrado_en')
      .eq('dispositivo_id', d.id)
      .order('registrado_en', { ascending: true })
      .limit(5000);
    if (req.query.tipo) consulta = consulta.eq('tipo', String(req.query.tipo));
    if (req.query.monitoreo) consulta = consulta.eq('monitoreo_id', String(req.query.monitoreo));
    if (req.query.desde) consulta = consulta.gte('registrado_en', String(req.query.desde));
    if (req.query.hasta) consulta = consulta.lte('registrado_en', String(req.query.hasta));
    const { data, error } = await consulta;
    if (error && error.code !== '22P02') throw error;
    res.json((data ?? []).map((l) => ({ t: l.registrado_en, v: Number(l.valor), unidad: l.unidad })));
  } catch (err) {
    next(err);
  }
});

// GET /api/dispositivos/:id/eventos?limite=50 — últimos eventos, el más reciente primero (HU-TRN-01)
router.get('/:id/eventos', async (req, res, next) => {
  try {
    const d = await dispositivoDelAmbiente(req, res);
    if (!d) return;
    const limite = Math.min(Number(req.query.limite) || 50, 500);
    const { data, error } = await supabase
      .from('eventos')
      .select('id, tipo, detalle, foto_url, registrado_en')
      .eq('dispositivo_id', d.id)
      .order('registrado_en', { ascending: false })
      .limit(limite);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
