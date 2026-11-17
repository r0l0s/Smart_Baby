// Manejador de errores: cualquier error no atrapado responde en español.
export function manejarErrores(err, req, res, next) {
  console.error('[api] Error:', err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Error interno del servidor' });
}
