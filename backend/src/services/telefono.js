// Normaliza un teléfono: deja solo dígitos; si tiene 8 dígitos, antepone 506 (Costa Rica).
// Se usa igual en registro, inicio de sesión y al comparar el contacto de Telegram.
//   "8888-8888"        → "50688888888"
//   "+506 8888 8888"   → "50688888888"
export function normalizarTelefono(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  return digitos.length === 8 ? `506${digitos}` : digitos;
}

// Válido si tiene entre 8 y 15 dígitos después de normalizar (estándar internacional E.164).
export function telefonoValido(normalizado) {
  return normalizado.length >= 8 && normalizado.length <= 15;
}
