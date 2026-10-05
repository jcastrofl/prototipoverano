/* =====================================================================
   Campaña de verano y registro de solicitudes.
   PROTOTIPO: se guarda en el navegador (localStorage), compartido entre el
   portal del estudiante y el panel. En el piloto, estas mismas funciones
   llamarán al backend (Supabase / Laravel).
   ===================================================================== */
window.UCP = window.UCP || {};
(function () {
  const KC = 'uc_proto_campana', KS = 'uc_proto_solicitudes';
  const C = {};
  C.FASES = {
    solicitudes: { t: 'Solicitudes abiertas', d: 'Los estudiantes solicitan la apertura de cursos. Aún no hay horarios.' },
    evaluacion: { t: 'Solicitudes cerradas · en evaluación', d: 'Coordinación decide qué cursos abrir y programa los horarios.' },
    horarios: { t: 'Horarios publicados', d: 'Los estudiantes eligen sección y luego se matriculan en la intranet.' }
  };
  C.ESTADOS_CURSO = { por_decidir: 'Por decidir', abierto: 'Abierto', no_abierto: 'No abierto' };
  C.SEGUIMIENTO = { pendiente: 'Pendiente', contactado: 'Contactado', orientado: 'Orientado', matriculado: 'Matriculado' };
  C.PREFERENCIAS = { whatsapp: 'WhatsApp', llamada: 'Llamada', correo: 'Correo' };

  const DEF = () => ({ fase: 'solicitudes', inicio: '2026-10-26', cierre: '2026-11-13', horarios: '2026-11-20', matInicio: '2026-12-01', matFin: '2026-12-15', minimoDefecto: 15, carga: null, minimos: {}, cursos: {} });
  const hoy = () => new Date().toISOString();

  C.leer = () => { try { return Object.assign(DEF(), JSON.parse(localStorage.getItem(KC) || '{}')); } catch (e) { return DEF(); } };
  C.guardar = (c) => localStorage.setItem(KC, JSON.stringify(c));
  // Carga por ciclo para los escenarios: la definida por Coordinación o, por defecto, el máximo del plan
  C.cargaPlan = (malla) => { const t = {}; malla.cursos.forEach((x) => { t[x.ciclo] = (t[x.ciclo] || 0) + x.creditos; }); return Math.max(...Object.values(t)); };
  C.carga = (c, malla) => c.carga || C.cargaPlan(malla);
  C.minimo = (c, codigo) => (c.minimos[codigo] != null ? c.minimos[codigo] : c.minimoDefecto);
  C.estadoCurso = (c, codigo) => (c.cursos[codigo] && c.cursos[codigo].estado) || 'por_decidir';
  C.seccionesCurso = (c, codigo) => (c.cursos[codigo] && c.cursos[codigo].secciones) || [];

  // ---------- Solicitudes ----------
  C.solicitudes = function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KS) || 'null'); } catch (e) { s = null; }
    if (!s) { s = semilla(); localStorage.setItem(KS, JSON.stringify(s)); }
    return s;
  };
  const guardarTodas = (s) => localStorage.setItem(KS, JSON.stringify(s));
  C.vigentes = () => C.solicitudes().filter((x) => x.estado === 'vigente');
  C.solicitudDe = (estId) => C.vigentes().find((x) => x.estudiante.id === estId) || null;

  C.guardarSolicitud = function (datos) {
    const todas = C.solicitudes();
    const i = todas.findIndex((x) => x.estudiante.id === datos.estudiante.id && x.estado === 'vigente');
    const previa = i >= 0 ? todas[i] : null;
    const reg = Object.assign({}, previa || {}, datos, {
      id: previa ? previa.id : 'SV-2027-' + String(Math.floor(100000 + Math.random() * 899999)),
      fecha: hoy(), estado: 'vigente',
      seguimiento: previa ? previa.seguimiento : { estado: 'pendiente', notas: '', historial: [] }
    });
    reg.seguimiento.historial = reg.seguimiento.historial.concat([{ fecha: hoy(), accion: previa ? 'Solicitud modificada por el estudiante' : 'Solicitud registrada por el estudiante', usuario: 'Estudiante' }]);
    if (i >= 0) todas[i] = reg; else todas.push(reg);
    guardarTodas(todas);
    return { ok: true, id: reg.id, fecha: reg.fecha };
  };
  C.retirar = function (estId) {
    const todas = C.solicitudes(), r = todas.find((x) => x.estudiante.id === estId && x.estado === 'vigente');
    if (r) { r.estado = 'retirada'; r.seguimiento.historial.push({ fecha: hoy(), accion: 'Solicitud retirada por el estudiante', usuario: 'Estudiante' }); guardarTodas(todas); }
  };
  C.actualizarSeguimiento = function (id, cambios, usuario, accion) {
    const todas = C.solicitudes(), r = todas.find((x) => x.id === id); if (!r) return;
    Object.assign(r.seguimiento, cambios);
    if (accion) r.seguimiento.historial.push({ fecha: hoy(), accion, usuario });
    guardarTodas(todas);
  };

  // Demanda por curso (solicitudes vigentes)
  C.demanda = function () {
    const d = {}; C.vigentes().forEach((s) => s.cursos.forEach((c) => { d[c.codigo] = (d[c.codigo] || 0) + 1; })); return d;
  };

  // Coordinación cambia el estado de un curso: se registra el correo automático a los solicitantes
  C.decidirCurso = function (codigo, estado, secciones, usuario) {
    const c = C.leer(); c.cursos[codigo] = { estado, secciones: secciones || C.seccionesCurso(c, codigo) }; C.guardar(c);
    if (estado === 'por_decidir') return 0;
    const todas = C.solicitudes(); let n = 0;
    todas.filter((s) => s.estado === 'vigente' && s.cursos.some((x) => x.codigo === codigo)).forEach((s) => {
      const nombre = (s.cursos.find((x) => x.codigo === codigo) || {}).nombre || codigo;
      s.seguimiento.historial.push({ fecha: hoy(), accion: `Correo automático: ${nombre} ${estado === 'abierto' ? 'se abrió' : 'no se abrió'}`, usuario: 'Sistema' }); n++;
    });
    guardarTodas(todas); return n;
  };

  C.reiniciar = function () { localStorage.removeItem(KC); localStorage.removeItem(KS); Object.keys(localStorage).filter((k) => k.startsWith('uc_proto_solicitud_')).forEach((k) => localStorage.removeItem(k)); };

  // ---------- Solicitudes ficticias para la demostración ----------
  function semilla() {
    const P = window.UC_PROTO; if (!P) return [];
    let r = 20271;
    const azar = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    const N = ['ANA', 'LUIS', 'CARLA', 'JORGE', 'ROSA', 'DIEGO', 'LUCÍA', 'MARCO', 'PAOLA', 'RAÚL', 'SOFÍA', 'IVÁN', 'ELENA', 'HUGO', 'NORA', 'PABLO', 'VALERIA', 'ÓSCAR', 'GIULIANA', 'RENZO'];
    const A = ['QUISPE', 'MAMANI', 'FLORES', 'TORRES', 'ROJAS', 'HUAMÁN', 'CHÁVEZ', 'VARGAS', 'MENDOZA', 'RAMOS', 'CASTILLO', 'PAREDES', 'SALAZAR', 'GUTIÉRREZ', 'CÁRDENAS', 'POMA'];
    // Demanda concentrada en pocos cursos de ciclos intermedios, como ocurre en la realidad
    const of = P.oferta.cursos.filter((o) => { const c = P.malla.cursos.find((x) => x.codigo === o.codigo); return c && c.ciclo >= 3 && c.ciclo <= 7; }).slice(0, 10);
    const pesos = of.map((o, i) => [9, 7, 6, 5, 4, 3, 2.5, 2, 1.5, 1][i] || 1);
    const total = pesos.reduce((a, b) => a + b, 0);
    const elegir = () => { let x = azar() * total; for (let i = 0; i < of.length; i++) { x -= pesos[i]; if (x <= 0) return of[i]; } return of[0]; };
    const prefs = ['whatsapp', 'whatsapp', 'whatsapp', 'llamada', 'correo'];
    const segs = ['pendiente', 'pendiente', 'pendiente', 'contactado', 'orientado'];
    const out = [];
    for (let k = 1; k <= 60; k++) {
      const nom = N[Math.floor(azar() * N.length)], ap = A[Math.floor(azar() * A.length)] + ' ' + A[Math.floor(azar() * A.length)];
      const cursos = new Map(); const n = 1 + Math.floor(azar() * 3); let cr = 0;
      for (let j = 0; j < n * 3 && cursos.size < n; j++) { const o = elegir(); if (!cursos.has(o.codigo) && cr + o.creditos <= 11) { cursos.set(o.codigo, { codigo: o.codigo, nombre: o.nombre, creditos: o.creditos, seccion: null, sesiones: [] }); cr += o.creditos; } }
      const dia = 26 + Math.floor(azar() * 12), fecha = dia <= 31 ? `2026-10-${dia}T15:00:00Z` : `2026-11-0${dia - 31}T15:00:00Z`;
      const seg = segs[Math.floor(azar() * segs.length)];
      const hist = [{ fecha, accion: 'Solicitud registrada por el estudiante', usuario: 'Estudiante' }];
      if (seg !== 'pendiente') hist.push({ fecha, accion: 'Contacto por WhatsApp', usuario: 'Mesa de ayuda' });
      out.push({
        id: 'SV-2027-' + String(400000 + k * 731), fecha, estado: 'vigente', autorizacion_datos: true,
        estudiante: { id: 'DEMO-' + String(k).padStart(4, '0'), nombres: nom, apellidos: ap, correo: `estudiante${String(k).padStart(3, '0')}.demo@continental.edu.pe`, carrera: 'Ingeniería de Sistemas e Informática', ciclo: 3 + Math.floor(azar() * 5) },
        contacto: { celular: '51 9' + String(10000000 + Math.floor(azar() * 89999999)).slice(0, 2) + ' ' + String(Math.floor(100 + azar() * 899)) + ' ' + String(Math.floor(100 + azar() * 899)), preferencia: prefs[Math.floor(azar() * prefs.length)] },
        cursos: [...cursos.values()], creditos: cr,
        seguimiento: { estado: seg, notas: '', historial: hist }
      });
    }
    return out;
  }

  // Celular de ejemplo para los 3 estudiantes del portal
  C.celularDemo = (estId) => ({ E0000001: '51 987 654 321', E0000002: '51 912 345 678', E0000003: '51 945 678 123' }[estId] || '');

  UCP.campana = C;
})();
