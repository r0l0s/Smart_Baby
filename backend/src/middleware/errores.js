// Manejador de errores: cualquier error no atrapado responde en español.
export function manejarErrores(err, req, res, next) {
  console.error('[api] Error:', err);
  if (res.headersSent) return next(err);
  // Los errores que creamos a propósito traen "status" y un mensaje en español para el usuario.
  const status = err.status || 500;
  res.status(status).json({ error: err.status ? err.message : 'Error interno del servidor' });
}
