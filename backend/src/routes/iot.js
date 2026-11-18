// Rutas para los DISPOSITIVOS (no para el navegador).
// POST /api/iot/:codigo/fotos — el sistema de seguridad sube la foto de un movimiento (HU-SEG-02).
//   multipart/form-data con el campo "foto" (+ opcional "ts").
//   Encabezado "X-Dispositivo-Clave" con la clave IOT_CLAVE (los dispositivos no inician sesión).
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { dispositivoPorCodigo, monitoreoActivo } from '../services/registro.js';
import { registrarMovimiento } from '../services/seguridad.js';

const router = Router();
const TIPOS_IMAGEN = new Set(['image/jpeg', 'image/png']);
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, archivo, cb) => cb(null, TIPOS_IMAGEN.has(archivo.mimetype)),
});

router.post('/:codigo/fotos', subida.single('foto'), async (req, res, next) => {
  try {
    if (req.get('X-Dispositivo-Clave') !== config.iotClave) {
      return res.status(401).json({ error: 'Clave de dispositivo inválida' });
    }
    if (!req.file) return res.status(400).json({ error: 'Falta la foto (campo "foto", JPG o PNG, máx. 5 MB)' });

    const dispositivo = await dispositivoPorCodigo(req.params.codigo);
    if (!dispositivo || dispositivo.tipo !== 'seguridad') {
      return res.status(404).json({ error: 'Dispositivo de seguridad no vinculado' });
    }
    // HU-SEG-01 CA3: con el sistema desactivado no se registra nada.
    if (!(await monitoreoActivo(dispositivo.id))) {
      return res.status(409).json({ error: 'El sistema de seguridad está desactivado' });
    }

    const evento = await registrarMovimiento(dispositivo, req.file.buffer, req.file.mimetype, req.body?.ts);
    res.status(201).json({ id: evento.id, foto_url: evento.foto_url });
  } catch (err) {
    next(err);
  }
});

export default router;
