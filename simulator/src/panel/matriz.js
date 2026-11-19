// Dibuja en el panel la matriz LED 8×8 tal como la está mostrando el dispositivo.
// Usa el estado que publica la matriz: patrón (cuadros en hexadecimal), velocidad y desde cuándo
// corre la animación. Se redibuja cada 50 ms.
const VistaMatriz = (() => {
  const INTERVALOS_MS = { lenta: 800, media: 400, rapida: 150 };
  const estados = new Map(); // codigo → estado de la matriz

  function cuadroActual(e) {
    if (!e?.encendida || !e.fase_inicio || !e.patron?.length) return null;
    const pasados = Math.floor((Date.now() - new Date(e.fase_inicio)) / (INTERVALOS_MS[e.velocidad] ?? 400));
    return e.patron[(e.cuadro_inicio + pasados) % e.patron.length];
  }

  function dibujar() {
    for (const el of document.querySelectorAll('.matriz[data-codigo]')) {
      const e = estados.get(el.dataset.codigo);
      const hex = cuadroActual(e);
      if (el.children.length !== 64) el.innerHTML = '<span></span>'.repeat(64);
      for (let fila = 0; fila < 8; fila++) {
        const bits = hex ? parseInt(hex.slice(fila * 2, fila * 2 + 2), 16) : 0;
        for (let col = 0; col < 8; col++) {
          el.children[fila * 8 + col].className = bits & (0x80 >> col) ? 'on' : '';
        }
      }
    }
  }

  setInterval(dibujar, 50);
  return {
    actualizar(codigo, estado) {
      estados.set(codigo, estado);
    },
    dibujar,
  };
})();
