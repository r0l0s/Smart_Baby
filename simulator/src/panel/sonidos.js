// "Parlante" de la cuna simulada: genera los sonidos pregrabados con la Web Audio API del
// navegador (no se necesitan archivos de audio). Los navegadores solo permiten sonido después de
// un clic del usuario, por eso hay que activarlo con el botón del panel.
const SonidosCuna = (() => {
  const NOMBRES = {
    cancion_cuna: 'Canción de cuna',
    ruido_blanco: 'Ruido blanco',
    lluvia: 'Lluvia',
    olas: 'Olas del mar',
    latido: 'Latido del corazón',
  };
  let ctx = null;
  let activo = false;
  let actual = null; // id del sonido que suena
  let detener = null; // función que detiene el sonido actual

  function ruido(color = 'blanco') {
    const largo = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, largo, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    let ultimo = 0;
    for (let i = 0; i < largo; i++) {
      const blanco = Math.random() * 2 - 1;
      if (color === 'marron') {
        ultimo = (ultimo + 0.02 * blanco) / 1.02;
        datos[i] = ultimo * 3.5;
      } else {
        datos[i] = blanco;
      }
    }
    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    fuente.loop = true;
    return fuente;
  }

  const GENERADORES = {
    ruido_blanco(salida) {
      const f = ruido();
      const g = ctx.createGain();
      g.gain.value = 0.08;
      f.connect(g).connect(salida);
      f.start();
      return () => f.stop();
    },
    lluvia(salida) {
      const f = ruido();
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      f.connect(filtro).connect(g).connect(salida);
      f.start();
      return () => f.stop();
    },
    olas(salida) {
      const f = ruido('marron');
      const g = ctx.createGain();
      g.gain.value = 0.15;
      const lfo = ctx.createOscillator(); // el volumen sube y baja como las olas
      lfo.frequency.value = 0.12;
      const lfoGanancia = ctx.createGain();
      lfoGanancia.gain.value = 0.13;
      lfo.connect(lfoGanancia).connect(g.gain);
      f.connect(g).connect(salida);
      f.start();
      lfo.start();
      return () => {
        f.stop();
        lfo.stop();
      };
    },
    latido(salida) {
      const golpe = (t, fuerza) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(fuerza, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(salida);
        o.start(t);
        o.stop(t + 0.2);
      };
      const latir = () => {
        const t = ctx.currentTime + 0.05;
        golpe(t, 0.9);
        golpe(t + 0.28, 0.6);
      };
      latir();
      const id = setInterval(latir, 900);
      return () => clearInterval(id);
    },
    cancion_cuna(salida) {
      // Canción de cuna de Brahms (dominio público), en notas MIDI y duraciones en tiempos
      const melodia = [
        [64, 0.5], [64, 0.5], [67, 1.5], [64, 0.5], [64, 0.5], [67, 1.5], [64, 0.5], [67, 0.5], [72, 1], [71, 1.5],
        [69, 0.5], [69, 1], [67, 1], [62, 0.5], [64, 0.5], [65, 1], [62, 1], [62, 0.5], [64, 0.5], [65, 2],
        [62, 0.5], [65, 0.5], [71, 0.5], [69, 0.5], [67, 1], [71, 1], [72, 2.5],
      ];
      const tiempo = 0.42;
      const total = melodia.reduce((s, [, d]) => s + d, 0) * tiempo + 1;
      const tocar = () => {
        let t = ctx.currentTime + 0.05;
        for (const [nota, dur] of melodia) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = 440 * 2 ** ((nota - 69) / 12);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur * tiempo * 0.95);
          o.connect(g).connect(salida);
          o.start(t);
          o.stop(t + dur * tiempo);
          t += dur * tiempo;
        }
      };
      tocar();
      const id = setInterval(tocar, total * 1000);
      return () => clearInterval(id);
    },
  };

  function parar() {
    if (detener) detener();
    detener = null;
  }

  // ---- Desbloqueo para iPad / iPhone (todos los navegadores de iOS usan el motor de Safari) ----
  // 1. iOS solo deja sonar audio si algo empieza a sonar DENTRO del mismo toque del usuario.
  // 2. El audio generado (Web Audio) se silencia con el modo silencio del iPad. Reproducir un
  //    <audio> en bucle (silencioso) hace que iOS lo trate como reproducción de medios y no lo calle.
  let audioSilencioso = null;

  function wavSilencioso() {
    const muestras = 8000; // 1 s a 8 kHz, 8 bits
    const v = new DataView(new ArrayBuffer(44 + muestras));
    const texto = (pos, s) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
    texto(0, 'RIFF'); v.setUint32(4, 36 + muestras, true); texto(8, 'WAVE');
    texto(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    texto(36, 'data'); v.setUint32(40, muestras, true);
    for (let i = 0; i < muestras; i++) v.setUint8(44 + i, 128); // 128 = silencio en 8 bits
    return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
  }

  function desbloquearIOS() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS 17+
    } catch {}
    if (!audioSilencioso) {
      audioSilencioso = new Audio(wavSilencioso());
      audioSilencioso.loop = true;
      audioSilencioso.setAttribute('playsinline', '');
    }
    audioSilencioso.play().catch(() => {});
    // Un sonido vacío de 1 muestra, reproducido ya, "desbloquea" el AudioContext
    const vacio = ctx.createBufferSource();
    vacio.buffer = ctx.createBuffer(1, 1, 22050);
    vacio.connect(ctx.destination);
    vacio.start(0);
  }

  return {
    // Debe llamarse directamente desde el clic/toque del botón.
    alternar() {
      activo = !activo;
      if (activo) {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
        desbloquearIOS();
      } else {
        parar();
        actual = null;
        audioSilencioso?.pause();
      }
      return activo;
    },
    /** Estado del audio del navegador, para mostrarlo si algo falla */
    estadoContexto() {
      return ctx?.state ?? 'sin iniciar';
    },
    reproducir(id) {
      if (!activo || id === actual) return;
      parar();
      actual = id;
      if (id && GENERADORES[id]) {
        const volumen = ctx.createGain();
        volumen.gain.value = 1;
        volumen.connect(ctx.destination);
        const fin = GENERADORES[id](volumen);
        detener = () => {
          fin();
          volumen.disconnect();
        };
      }
    },
    descripcion(codigo) {
      if (!activo) return '';
      // Si el navegador mantiene el audio suspendido, se avisa: hay que volver a tocar el botón.
      if (ctx && ctx.state !== 'running') return `⚠️ El navegador no permitió el audio (estado: ${ctx.state}). Toca el botón otra vez.`;
      return actual ? `Sonando en ${codigo}: ${NOMBRES[actual] ?? actual}` : 'La cuna no está reproduciendo nada.';
    },
  };
})();
