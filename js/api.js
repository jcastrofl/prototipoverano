/* Capa de datos con la forma del contrato de API.
   Modo prototipo: responde con datos de demostración.
   Modo api: el backend Laravel identifica al estudiante por su sesión de Google (nunca por un dato del navegador). */
window.UCP = window.UCP || {};
(function () {
  const P = () => window.UC_PROTO;
  const usuario = () => sessionStorage.getItem('uc_proto_usuario');
  const perfilDemo = () => P().perfiles.find((p) => p.clave === usuario());
  const espera = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 120));
  async function backend(ruta, opciones) {
    const r = await fetch(UCP.config.backendBase + ruta, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }, opciones || {}));
    if (r.status === 401) { location.href = 'index.html'; throw new Error('sesion'); }
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }
  const proto = UCP.config.modo === 'prototipo';
  UCP.api = {
    sesion:        () => proto ? espera(perfilDemo() ? { ok: true } : { ok: false }) : backend('/sesion'),
    perfil:        () => proto ? espera(perfilDemo().perfil) : backend('/perfil'),
    historial:     () => proto ? espera({ cursos: perfilDemo().historial }) : backend('/historial'),
    malla:         () => proto ? espera(P().malla) : backend('/malla'),
    oferta:        () => proto ? espera(P().oferta) : backend('/oferta-verano'),
    parametros:    () => proto ? espera(P().parametros) : backend('/parametros'),
    calendario:    () => proto ? espera(P().calendario) : backend('/calendario'),
    habilitacion:  () => proto ? espera(perfilDemo().habilitacion) : backend('/habilitacion'),
    solicitudPrevia: () => proto ? espera(UCP.campana.solicitudDe(perfilDemo().perfil.id)) : backend('/solicitud'),
    enviarSolicitud: (payload) => proto ? espera(UCP.campana.guardarSolicitud(payload)) : backend('/solicitud', { method: 'POST', body: JSON.stringify(payload) }),
    retirarSolicitud: () => proto ? espera((UCP.campana.retirar(perfilDemo().perfil.id), { ok: true })) : backend('/solicitud', { method: 'DELETE' }),
    campana: () => proto ? espera(UCP.campana.leer()) : backend('/campana'),
    ingresarDemo: (clave) => sessionStorage.setItem('uc_proto_usuario', clave),
    salir: () => { sessionStorage.removeItem('uc_proto_usuario'); if (!proto) location.href = '/logout'; }
  };
})();
