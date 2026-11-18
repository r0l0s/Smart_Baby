// Formato de fechas para mostrar al usuario: hora de Costa Rica, "dd/MM/yyyy HH:mm".
const formato = new Intl.DateTimeFormat('es-CR', {
  timeZone: 'America/Costa_Rica',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatearFecha(fecha = new Date()) {
  const p = Object.fromEntries(formato.formatToParts(new Date(fecha)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
