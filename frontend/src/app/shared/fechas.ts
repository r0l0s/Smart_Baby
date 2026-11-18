// Formato de fechas para mostrar: hora de Costa Rica, "dd/MM/yyyy HH:mm".
const ZONA = 'America/Costa_Rica';

function partes(fecha: string | Date, conSegundos: boolean) {
  const f = new Intl.DateTimeFormat('es-CR', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(conSegundos && { second: '2-digit' }),
    hourCycle: 'h23',
  });
  return Object.fromEntries(f.formatToParts(new Date(fecha)).map((p) => [p.type, p.value]));
}

/** "18/11/2026 14:05" */
export function formatearFecha(fecha: string | Date): string {
  const p = partes(fecha, false);
  return `${p['day']}/${p['month']}/${p['year']} ${p['hour']}:${p['minute']}`;
}

/** "18/11/2026 14:05:09" */
export function formatearFechaSegundos(fecha: string | Date): string {
  const p = partes(fecha, true);
  return `${p['day']}/${p['month']}/${p['year']} ${p['hour']}:${p['minute']}:${p['second']}`;
}
