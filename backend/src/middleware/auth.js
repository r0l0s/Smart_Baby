// Middleware que exige un JWT válido en el encabezado "Authorization: Bearer <token>".
// Si es válido, deja en req.usuario = { id, ambiente_id, rol, nombre } para que las rutas
// filtren siempre por el ambiente del usuario (RNF-08).
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { supabase } from '../db.js';

const DURACION_SESION = '7d';

export function crearToken(usuario) {
  return jwt.sign({ sub: usuario.id, ambiente_id: usuario.ambiente_id, rol: usuario.rol }, config.jwtSecret, {
    expiresIn: DURACION_SESION,
  });
}

export async function requiereSesion(req, res, next) {
  const [esquema, token] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }

  let datos;
  try {
    datos = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'La sesión expiró, inicia sesión de nuevo' });
  }

  // Confirmar que el usuario todavía existe (por si se borró desde Supabase).
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, ambiente_id, rol, nombre')
    .eq('id', datos.sub)
    .maybeSingle();
  if (error) return next(error);
  if (!usuario) return res.status(401).json({ error: 'La sesión ya no es válida, inicia sesión de nuevo' });

  req.usuario = usuario;
  next();
}
