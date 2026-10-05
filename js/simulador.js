/* Reglas del simulador (sección "Reglas del simulador" del contrato de API). */
window.UCP = window.UCP || {};
(function () {
  const S = {};
  S.preparar = function ({ malla, historial, oferta, parametros }) {
    const cursos = {}; malla.cursos.forEach((c) => { cursos[c.codigo] = c; });
    const aprob = new Set(), enCurso = new Set(), desap = new Set();
    historial.cursos.forEach((h) => {
      if (h.estado === 'aprobado' || h.estado === 'convalidado') aprob.add(h.codigo);
      else if (h.estado === 'matriculado') enCurso.add(h.codigo);
      else if (h.estado === 'desaprobado') desap.add(h.codigo);
    });
    aprob.forEach((k) => desap.delete(k));
    const credAprob = [...aprob].reduce((s, k) => s + (cursos[k] ? cursos[k].creditos : 0), 0);
    const credEnCurso = [...enCurso].reduce((s, k) => s + (cursos[k] ? cursos[k].creditos : 0), 0);
    return { malla, cursos, oferta, parametros, aprob, enCurso, desap, credAprob, credEnCurso, credFaltan: malla.creditos_totales - credAprob };
  };
  S.estadoCurso = (M, k) => M.aprob.has(k) ? 'aprobado' : M.enCurso.has(k) ? 'en_curso' : M.desap.has(k) ? 'desaprobado' : 'pendiente';
  S.dependientes = function (M, k) {
    const hijos = {}; M.malla.cursos.forEach((c) => (c.prerrequisitos || []).flat().forEach((p) => { (hijos[p] ||= new Set()).add(c.codigo); }));
    const v = new Set(), st = [k]; while (st.length) { const x = st.pop(); (hijos[x] || []).forEach((h) => { if (!v.has(h)) { v.add(h); st.push(h); } }); }
    return v.size;
  };
  // Disponibilidad de un curso de verano: disponible | condicional | bloqueado
  S.disponibilidad = function (M, codigo) {
    const c = M.cursos[codigo]; if (!c) return { tipo: 'bloqueado', faltan: [] };
    const req = (c.prerrequisitos || []).flat();
    const faltan = req.filter((p) => !M.aprob.has(p));
    if (!faltan.length) return { tipo: 'disponible', faltan: [] };
    if (faltan.every((p) => M.enCurso.has(p))) return { tipo: 'condicional', faltan };
    return { tipo: 'bloqueado', faltan };
  };
  S.clasificarOferta = function (M) {
    return M.oferta.cursos.filter((o) => !M.aprob.has(o.codigo) && !M.enCurso.has(o.codigo)).map((o) => {
      const c = M.cursos[o.codigo] || {}, d = S.disponibilidad(M, o.codigo);
      const prioridad = M.desap.has(o.codigo) ? 0 : c.curso_clave ? 1 : 2;
      return Object.assign({}, o, { ciclo: c.ciclo, curso_clave: !!c.curso_clave, recuperacion: M.desap.has(o.codigo), disponibilidad: d, prioridad });
    }).sort((a, b) => a.prioridad - b.prioridad || a.ciclo - b.ciclo || a.nombre.localeCompare(b.nombre));
  };
  const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  S.cruces = function (items) {
    const ses = []; items.forEach((i) => (i.sesiones || []).forEach((s) => ses.push({ i, s })));
    const out = [];
    for (let a = 0; a < ses.length; a++) for (let b = a + 1; b < ses.length; b++) {
      const x = ses[a], y = ses[b];
      if (x.i.codigo !== y.i.codigo && x.s.dia === y.s.dia && minutos(x.s.hora_inicio) < minutos(y.s.hora_fin) && minutos(y.s.hora_inicio) < minutos(x.s.hora_fin))
        out.push([x.i.codigo, y.i.codigo, x.s.dia]);
    }
    return out;
  };
  // Agrupa los cruces por par de cursos: [{a, b, dias:[1,3,5]}]
  S.paresCruce = function (cruces) {
    const m = new Map();
    cruces.forEach(([a, b, d]) => { const k = [a, b].sort().join('|'); if (!m.has(k)) m.set(k, { a, b, dias: [] }); if (!m.get(k).dias.includes(d)) m.get(k).dias.push(d); });
    return [...m.values()];
  };
  // Validaciones de la selección. Los cruces de horario NO bloquean: en la modalidad
  // a distancia las sesiones en vivo se graban y la asistencia no es obligatoria.
  S.validar = function (M, sel, habilitacion, fase) {
    const items = [...sel.values()];
    const creditos = items.reduce((s, i) => s + i.creditos, 0), max = M.parametros.creditos_max_verano;
    const cruces = S.cruces(items), pares = S.paresCruce(cruces);
    const conHorario = fase === 'horarios';
    const sinSeccion = items.filter((i) => !i.seccion);
    const v = [
      { ok: items.length > 0, texto: items.length ? `${items.length} ${items.length === 1 ? 'curso' : 'cursos'} en tu solicitud` : 'Elige al menos un curso', bloquea: !items.length },
      { ok: creditos <= max, texto: `${creditos} de ${max} créditos permitidos en verano`, bloquea: creditos > max },
      { ok: true, texto: 'Cumples los prerrequisitos de todos tus cursos' },
      conHorario
        ? { ok: true, aviso: sinSeccion.length > 0, texto: sinSeccion.length ? `Falta elegir sección en ${sinSeccion.length} ${sinSeccion.length === 1 ? 'curso' : 'cursos'}` : 'Elegiste sección en todos tus cursos' }
        : { ok: true, aviso: true, texto: 'Los horarios se publicarán al cierre de las solicitudes' },
      conHorario && pares.length ? { ok: true, aviso: true, texto: `${pares.length} ${pares.length === 1 ? 'coincidencia' : 'coincidencias'} de sesiones en vivo: quedan grabadas` } : null,
      { ok: habilitacion.habilitado, texto: habilitacion.habilitado ? 'Estás habilitado para matricularte' : 'Tienes un impedimento de matrícula', bloquea: !habilitacion.habilitado }
    ].filter(Boolean);
    return { creditos, max, cruces, pares, validaciones: v, puedeEnviar: !v.some((x) => x.bloquea) };
  };

  // Escenarios de egreso con 0, 1, 2 y 3 veranos consecutivos desde el próximo.
  // Supone que aprueba lo que lleva ahora; respeta prerrequisitos; hasta `carga` créditos
  // por ciclo y `maxVerano` por verano (solo cursos que pueden dictarse en verano).
  S.escenarios = function (M, opciones) {
    const carga = opciones.carga || 21, maxV = M.parametros.creditos_max_verano, cicloAct = opciones.cicloActual, anio0 = opciones.anio || 2027;
    const cursos = M.malla.cursos.slice().sort((a, b) => a.ciclo - b.ciclo || a.codigo.localeCompare(b.codigo));
    const proyectar = (nVeranos) => {
      const hechos = new Set([...M.aprob, ...M.enCurso]);
      let pend = cursos.filter((c) => !hechos.has(c.codigo));
      let ciclo = cicloAct, usados = 0, credReg = [], fin = null;
      for (let a = anio0; a < anio0 + 8 && pend.length; a++) {
        for (const tipo of ['verano', 'I', 'II']) {
          if (!pend.length) break;
          if (tipo === 'verano' && (a - anio0) >= nVeranos) continue;
          const cap = tipo === 'verano' ? maxV : carga, previos = new Set(hechos), tom = []; let u = 0;
          for (const c of pend) {
            if (tipo === 'verano' && !c.se_dicta_en_verano) continue;
            if (!(c.prerrequisitos || []).flat().every((k) => previos.has(k))) continue;
            if (u + c.creditos > cap) continue;
            tom.push(c); u += c.creditos;
          }
          tom.forEach((c) => hechos.add(c.codigo)); pend = pend.filter((c) => !tom.includes(c));
          if (tipo === 'verano') { if (tom.length) usados++; } else { ciclo++; credReg.push(u); }
          if (!pend.length) fin = tipo === 'verano' ? { tipo, anio: a, ciclo } : { tipo, anio: a, ciclo, periodo: `${a}-${tipo}` };
        }
      }
      return { fin, usados, ciclosRestantes: credReg.length, promedio: credReg.length ? Math.round(credReg.reduce((x, y) => x + y, 0) / credReg.length) : 0 };
    };
    const out = [];
    for (let n = 0; n <= 3; n++) {
      const r = proyectar(n);
      if (n > 0 && r.usados < n) break;               // ese verano ya no haría falta
      const base = out[0];
      const etiqueta = n === 0 ? 'Sin veranos' : `Con ${n} ${n === 1 ? 'verano' : 'veranos'} (${Array.from({ length: n }, (_, k) => anio0 + k).join(', ').replace(/, (\d+)$/, ' y $1')})`;
      const termina = !r.fin ? 'Por confirmar' : r.fin.tipo === 'verano' ? `Verano ${r.fin.anio} · tras el ciclo ${r.fin.ciclo}` : `Ciclo ${r.fin.ciclo} · ${r.fin.periodo}`;
      const ahorro = base ? base.ciclosRestantes - r.ciclosRestantes : 0;
      const previo = out[out.length - 1];
      let nota = '';
      if (n === 0) nota = `${r.ciclosRestantes} ${r.ciclosRestantes === 1 ? 'ciclo' : 'ciclos'} más, unos ${r.promedio} créditos por ciclo`;
      else if (previo && r.ciclosRestantes === previo.ciclosRestantes) nota = `${n === 1 ? 'No acorta tu egreso' : 'No acorta más'}, pero tus ciclos serían más livianos (unos ${r.promedio} créditos)`;
      else nota = `Terminas ${ahorro} ${ahorro === 1 ? 'ciclo' : 'ciclos'} antes`;
      out.push({ n, etiqueta, termina, ciclosRestantes: r.ciclosRestantes, promedio: r.promedio, ahorro, nota, acorta: n > 0 && previo && r.ciclosRestantes < previo.ciclosRestantes });
    }
    return out;
  };

  // Proyección referencial: créditos pendientes tras el ciclo actual, repartidos en semestres de carga referencial
  S.proyeccion = function (M, creditosVerano) {
    const carga = UCP.config.cargaReferencialSemestre;
    const pend = Math.max(0, M.credFaltan - M.credEnCurso);
    const semestres = (c) => Math.ceil(Math.max(0, c) / carga);
    const periodo = (n) => { const a = 2027 + Math.floor((n - 1) / 2); return `${a}-${n % 2 ? 'I' : 'II'}`; };
    const sin = semestres(pend), con = semestres(pend - creditosVerano);
    return { pendientes: pend, sinVerano: sin ? periodo(sin) : 'Al cerrar 2026-II', conVerano: con ? periodo(con) : 'Al terminar el verano 2027', ahorro: sin - con };
  };
  UCP.sim = S;
})();
