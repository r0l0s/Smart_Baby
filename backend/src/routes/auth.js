// Rutas de autenticación: registro (HU-PLA-01), inicio de sesión (HU-PLA-03) y "quién soy".
// El cierre de sesión ocurre en el navegador: se borra el token guardado.
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../db.js';
import { normalizarTelefono, telefonoValido } from '../services/telefono.js';
import { crearToken, requiereSesion } from '../middleware/auth.js';
import { tokenVerificacion, enlaceBot } from '../services/tokensTelegram.js';
import QRCode from 'qrcode';

const router = Router();

const MIN_PASSWORD = 8;
const RONDAS_BCRYPT = 10;
const ERROR_LOGIN = 'Teléfono o contraseña incorrectos';
// Hash de relleno: si el teléfono no existe igual se compara algo, para que la
// respuesta tarde lo mismo y no revele si el teléfono está registrado.
const HASH_RELLENO = bcrypt.hashSync('relleno-para-tiempo-constante', RONDAS_BCRYPT);

// Datos del usuario que sí se pueden enviar al navegador (nunca el hash).
function usuarioPublico(u) {
  return { id: u.id, nombre: u.nombre, telefono: u.telefono, rol: u.rol, verificado: u.verificado };
}

// Responde 400 indicando el campo con problema (CA2 de HU-PLA-01).
function errorCampo(res, campo, mensaje) {
  return res.status(400).json({ error: mensaje, campo });
}

// POST /api/auth/registro  { nombre, telefono, password }
router.post('/registro', async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre ?? '').trim();
    const telefonoTexto = String(req.body?.telefono ?? '').trim();
    const password = String(req.body?.password ?? '');

    if (!nombre) return errorCampo(res, 'nombre', 'El nombre es obligatorio');
    if (!telefonoTexto) return errorCampo(res, 'telefono', 'El teléfono es obligatorio');
    if (!password) return errorCampo(res, 'password', 'La contraseña es obligatoria');

    const telefono = normalizarTelefono(telefonoTexto);
    if (!telefonoValido(telefono)) return errorCampo(res, 'telefono', 'El teléfono no es válido');
    if (password.length < MIN_PASSWORD) {
      return errorCampo(res, 'password', `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    }

    // CA4: teléfono ya registrado
    const { data: existente, error: errBuscar } = await supabase
      .from('usuarios')
      .select('id')
      .eq('telefono', telefono)
      .maybeSingle();
    if (errBuscar) throw errBuscar;
    if (existente) return res.status(409).json({ error: 'Este teléfono ya está registrado', campo: 'telefono' });

    const password_hash = await bcrypt.hash(password, RONDAS_BCRYPT);

    // Cada cuenta nueva crea su propio ambiente.
    const { data: ambiente, error: errAmbiente } = await supabase.from('ambientes').insert({}).select().single();
    if (errAmbiente) throw errAmbiente;

    const { data: usuario, error: errUsuario } = await supabase
      .from('usuarios')
      .insert({ ambiente_id: ambiente.id, rol: 'principal', nombre, telefono, password_hash, verificado: false })
      .select()
      .single();
    if (errUsuario) {
      await supabase.from('ambientes').delete().eq('id', ambiente.id); // no dejar ambientes huérfanos
      // 23505 = violación de "unique": alguien registró el mismo teléfono al mismo tiempo
      if (errUsuario.code === '23505') {
        return res.status(409).json({ error: 'Este teléfono ya está registrado', campo: 'telefono' });
      }
      throw errUsuario;
    }

    res.status(201).json({ token: crearToken(usuario), usuario: usuarioPublico(usuario) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login  { telefono, password }
// El principal usa su contraseña; un invitado usa SU teléfono + la contraseña del ambiente
// (que es la del usuario principal).
router.post('/login', async (req, res, next) => {
  try {
    const telefono = normalizarTelefono(req.body?.telefono);
    const password = String(req.body?.password ?? '');
    if (!telefono || !password) return res.status(400).json({ error: 'Ingresa tu teléfono y tu contraseña' });

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('telefono', telefono)
      .maybeSingle();
    if (error) throw error;

    let hash = HASH_RELLENO;
    if (usuario?.rol === 'principal') {
      hash = usuario.password_hash;
    } else if (usuario?.rol === 'invitado') {
      const { data: principal, error: errPrincipal } = await supabase
        .from('usuarios')
        .select('password_hash')
        .eq('ambiente_id', usuario.ambiente_id)
        .eq('rol', 'principal')
        .maybeSingle();
      if (errPrincipal) throw errPrincipal;
      if (principal) hash = principal.password_hash;
    }

    const coincide = await bcrypt.compare(password, hash);
    // CA2: mismo mensaje sin importar si falló el teléfono o la contraseña.
    if (!usuario || !coincide) return res.status(401).json({ error: ERROR_LOGIN });

    res.json({ token: crearToken(usuario), usuario: usuarioPublico(usuario) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/yo — datos del usuario de la sesión actual (requiere JWT).
router.get('/yo', requiereSesion, async (req, res, next) => {
  try {
    const { data: usuario, error } = await supabase.from('usuarios').select('*').eq('id', req.usuario.id).single();
    if (error) throw error;
    res.json({ usuario: usuarioPublico(usuario) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/perfil  { nombre?, telefono? }   (HU-PLA-07)
// Si el teléfono cambia, la cuenta queda sin verificar y se desvincula de Telegram hasta que
// se verifique de nuevo (CA3). Responde con { usuario, requiere_verificacion }.
router.put('/perfil', requiereSesion, async (req, res, next) => {
  try {
    const { data: actual, error } = await supabase.from('usuarios').select('*').eq('id', req.usuario.id).single();
    if (error) throw error;
    const cambios = {};

    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) return errorCampo(res, 'nombre', 'El nombre es obligatorio');
      if (nombre !== actual.nombre) cambios.nombre = nombre;
    }
    if (req.body?.telefono !== undefined) {
      const texto = String(req.body.telefono).trim();
      if (!texto) return errorCampo(res, 'telefono', 'El teléfono es obligatorio');
      const telefono = normalizarTelefono(texto);
      if (!telefonoValido(telefono)) return errorCampo(res, 'telefono', 'El teléfono no es válido');
      if (telefono !== actual.telefono) {
        const { data: otro, error: errOtro } = await supabase.from('usuarios').select('id').eq('telefono', telefono).maybeSingle();
        if (errOtro) throw errOtro;
        if (otro) return res.status(409).json({ error: 'Este teléfono ya está registrado', campo: 'telefono' });
        Object.assign(cambios, { telefono, verificado: false, telegram_chat_id: null });
      }
    }
    if (!Object.keys(cambios).length) return res.json({ usuario: usuarioPublico(actual), requiere_verificacion: false });

    const { data: usuario, error: errUpd } = await supabase.from('usuarios').update(cambios).eq('id', actual.id).select().single();
    if (errUpd) {
      if (errUpd.code === '23505') return res.status(409).json({ error: 'Este teléfono ya está registrado', campo: 'telefono' });
      throw errUpd;
    }
    if (cambios.telefono) {
      // Los enlaces de verificación anteriores ya no sirven (eran para el número viejo).
      await supabase.from('tokens_telegram').update({ usado: true }).eq('usuario_id', actual.id).eq('tipo', 'verificacion');
    }
    res.json({ usuario: usuarioPublico(usuario), requiere_verificacion: !!cambios.telefono });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password  { actual, nueva }   (HU-PLA-07, solo el usuario principal)
// Es la contraseña del ambiente: los invitados también inician sesión con ella.
router.put('/password', requiereSesion, async (req, res, next) => {
  try {
    if (req.usuario.rol !== 'principal') {
      return res.status(403).json({ error: 'Solo el usuario principal puede cambiar la contraseña del ambiente' });
    }
    const actualTexto = String(req.body?.actual ?? '');
    const nueva = String(req.body?.nueva ?? '');
    if (!actualTexto) return errorCampo(res, 'actual', 'Ingresa tu contraseña actual');
    if (nueva.length < MIN_PASSWORD) {
      return errorCampo(res, 'nueva', `La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres`);
    }
    const { data: u, error } = await supabase.from('usuarios').select('password_hash').eq('id', req.usuario.id).single();
    if (error) throw error;
    if (!(await bcrypt.compare(actualTexto, u.password_hash))) {
      return errorCampo(res, 'actual', 'La contraseña actual no es correcta');
    }
    const password_hash = await bcrypt.hash(nueva, RONDAS_BCRYPT);
    const { error: errUpd } = await supabase.from('usuarios').update({ password_hash }).eq('id', req.usuario.id);
    if (errUpd) throw errUpd;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verificacion — estado de verificación con Telegram (HU-PLA-02).
// Si aún no está verificado, incluye el enlace al bot (CA1) y su código QR para escanearlo
// con el teléfono. La página web consulta esta ruta cada pocos segundos hasta que verificado = true.
router.get('/verificacion', requiereSesion, async (req, res, next) => {
  try {
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('verificado')
      .eq('id', req.usuario.id)
      .single();
    if (error) throw error;
    if (usuario.verificado) return res.json({ verificado: true });

    const enlace = enlaceBot(await tokenVerificacion(req.usuario.id));
    const qr = await QRCode.toDataURL(enlace, { margin: 1, width: 220 });
    res.json({ verificado: false, enlace, qr });
  } catch (err) {
    next(err);
  }
});

export default router;
