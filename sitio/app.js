'use strict';

// CloudFront envía /api/* al balanceador. No se necesitan direcciones de AWS aquí.
const elemento = (id) => document.getElementById(id);
const historial = [];
let visitaEnCurso = false;
let estadisticasEnCurso = false;
let mensajesEnCurso = false;
let guardadoEnCurso = false;
let equipoEnCurso = false;

// La presentación usa la zona devuelta por AWS; nunca sustituye el ID real.
// Otras zonas siguen funcionando y aparecen como equipo visitante.
function equipoDeZona(zona) {
  if (zona === 'us-east-2a') return { nombre: 'Equipo Esmeralda', sector: 'Sector A', letra: 'A', clave: 'esmeralda' };
  if (zona === 'us-east-2b') return { nombre: 'Equipo Dorado', sector: 'Sector B', letra: 'B', clave: 'dorado' };
  return { nombre: 'Equipo visitante', sector: 'Otro sector · ' + zona, letra: 'V', clave: 'visitante' };
}

function estado(id, texto, esError = false) {
  const destino = elemento(id);
  destino.textContent = texto;
  destino.dataset.estado = esError ? 'error' : 'informacion';
}

// No se reintentan automáticamente las escrituras: podrían haberse guardado
// aunque se pierda la respuesta. El tiempo límite permite volver a usar los botones.
async function solicitar(ruta, opciones = {}) {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 15000);

  try {
    const respuesta = await fetch(ruta, {
      ...opciones,
      cache: 'no-store',
      signal: controlador.signal
    });
    const esJSON = (respuesta.headers.get('content-type') || '').includes('application/json');
    const datos = esJSON ? await respuesta.json() : null;

    if (!respuesta.ok) {
      const error = new Error(datos && datos.error ? datos.error : `La API respondió HTTP ${respuesta.status}.`);
      error.status = respuesta.status;
      throw error;
    }
    if (!esJSON) {
      throw new Error('La API no devolvió JSON. Compruebe que abrió el enlace SitioWeb.');
    }
    return datos;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('La API tardó más de 15 segundos en responder.');
    }
    if (error instanceof TypeError) {
      throw new Error('No se pudo conectar con la API. Revise su conexión y el estado de AWS.');
    }
    throw error;
  } finally {
    clearTimeout(limite);
  }
}

async function registrarVisita() {
  if (visitaEnCurso) return;
  visitaEnCurso = true;
  elemento('btn-preguntar').disabled = true;
  estado('estado-visita', 'Visita: registrando y consultando el servidor…');

  try {
    const datos = await solicitar('/api/visita');
    elemento('srv-id').textContent = datos.servidor;
    elemento('srv-zona').textContent = datos.zona;
    const equipo = equipoDeZona(datos.zona);
    // Permite publicar app.js antes que el HTML sin romper la página anterior.
    if (elemento('equipo-actual')) {
      elemento('equipo-nombre').textContent = equipo.nombre;
      elemento('equipo-sector').textContent = equipo.sector;
      elemento('equipo-letra').textContent = equipo.letra;
      elemento('equipo-actual').dataset.equipo = equipo.clave;
    }
    historial.unshift(`${datos.servidor} (${datos.zona})`);
    historial.splice(8);
    elemento('historial').textContent = `Últimas respuestas: ${historial.join(' · ')}`;
    estado('estado-visita', `${datos.mensaje}. Respondió ${datos.servidor} en ${datos.zona}.`);
  } catch (error) {
    estado('estado-visita', `Error al registrar la visita: ${error.message} Si se perdió la respuesta, la visita podría haberse registrado.`, true);
  } finally {
    visitaEnCurso = false;
    elemento('btn-preguntar').disabled = false;
  }
}

async function actualizarEstadisticas() {
  if (estadisticasEnCurso) return;
  estadisticasEnCurso = true;
  estado('estado-estadisticas', 'Estadísticas: consultando PostgreSQL…');

  try {
    const datos = await solicitar('/api/estadisticas');
    const barras = elemento('barras');
    elemento('total').textContent = datos.total;
    barras.replaceChildren();

    if (datos.servidores.length === 0) {
      barras.textContent = 'Todavía no hay visitas registradas.';
    }

    for (const servidor of datos.servidores) {
      const porcentaje = datos.total > 0 ? servidor.peticiones * 100 / datos.total : 0;
      const equipo = equipoDeZona(servidor.zona);
      const barra = document.createElement('div');
      barra.className = 'barra';
      barra.dataset.equipo = equipo.clave;
      const titulo = document.createElement('div');
      titulo.className = 'titulo';
      const nombre = document.createElement('span');
      nombre.textContent = equipo.nombre;
      const identidad = document.createElement('span');
      identidad.className = 'identidad-servidor';
      identidad.textContent = `${servidor.servidor} · ${servidor.zona}`;
      nombre.append(identidad);
      const cantidad = document.createElement('span');
      cantidad.textContent = `${servidor.peticiones} (${porcentaje.toFixed(1)} %)`;
      titulo.append(nombre, cantidad);

      const fondo = document.createElement('div');
      fondo.className = 'fondo';
      fondo.setAttribute('role', 'progressbar');
      fondo.setAttribute('aria-label', `Porcentaje de visitas de ${servidor.servidor} en ${servidor.zona}`);
      fondo.setAttribute('aria-valuemin', '0');
      fondo.setAttribute('aria-valuemax', '100');
      fondo.setAttribute('aria-valuenow', porcentaje.toFixed(1));
      const relleno = document.createElement('div');
      relleno.className = 'relleno';
      relleno.style.width = `${porcentaje}%`;
      fondo.append(relleno);
      barra.append(titulo, fondo);
      barras.append(barra);
    }

    estado('estado-estadisticas', `Estadísticas actualizadas. Respondió ${datos.respondio}.`);
  } catch (error) {
    estado('estado-estadisticas', `Error al consultar estadísticas: ${error.message} Los datos anteriores se conservan; se reintentará en 5 segundos.`, true);
  } finally {
    estadisticasEnCurso = false;
  }
}

async function cargarMensajes() {
  const lista = await solicitar('/api/mensajes');
  const mensajes = elemento('mensajes');
  mensajes.replaceChildren();

  if (lista.length === 0) {
    const vacio = document.createElement('li');
    vacio.textContent = 'Todavía no hay mensajes. Puede escribir el primero.';
    mensajes.append(vacio);
  }

  for (const mensaje of lista) {
    const fila = document.createElement('li');
    const nombre = document.createElement('b');
    nombre.textContent = mensaje.nombre;
    const texto = document.createElement('span');
    texto.textContent = `: ${mensaje.mensaje}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${new Date(mensaje.fecha).toLocaleString('es-GT')} · guardado por ${mensaje.servidor}`;
    fila.append(nombre, texto, meta);
    mensajes.append(fila);
  }
}

function bloquearMensajes(bloqueado) {
  elemento('btn-guardar').disabled = bloqueado;
  elemento('btn-mensajes').disabled = bloqueado;
  elemento('nombre').disabled = bloqueado;
  elemento('mensaje').disabled = bloqueado;
}

async function actualizarMensajes() {
  if (mensajesEnCurso || guardadoEnCurso) return;
  mensajesEnCurso = true;
  bloquearMensajes(true);
  estado('estado-mensajes', 'Mensajes: consultando el muro de aficionados…');

  try {
    await cargarMensajes();
    estado('estado-mensajes', 'Muro de aficionados actualizado: hasta los 50 mensajes más recientes.');
  } catch (error) {
    estado('estado-mensajes', `Error al consultar mensajes: ${error.message} Puede usar «Actualizar mensajes» para reintentar.`, true);
  } finally {
    mensajesEnCurso = false;
    bloquearMensajes(false);
  }
}

async function guardarMensaje(evento) {
  evento.preventDefault();
  if (guardadoEnCurso || mensajesEnCurso) return;
  const formulario = elemento('formulario');
  if (!formulario.reportValidity()) return;
  const nombre = elemento('nombre').value.trim();
  const mensaje = elemento('mensaje').value.trim();

  if (!nombre || !mensaje) {
    estado('estado-mensajes', 'Escriba un nombre y un mensaje; no pueden contener solo espacios.', true);
    elemento(!nombre ? 'nombre' : 'mensaje').focus();
    return;
  }

  guardadoEnCurso = true;
  bloquearMensajes(true);
  estado('estado-mensajes', 'Mensaje: guardando en PostgreSQL…');

  try {
    const datos = await solicitar('/api/mensajes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, mensaje })
    });
    formulario.reset();
    const confirmacion = `${datos.mensaje} (n.º ${datos.id}). Procesado por ${datos.servidor}.`;
    estado('estado-mensajes', confirmacion);

    // Un fallo al refrescar la lista no convierte un guardado confirmado en error.
    try {
      await cargarMensajes();
    } catch (error) {
      estado('estado-mensajes', `${confirmacion} No se pudo actualizar la lista: ${error.message} Use «Actualizar mensajes».`, true);
    }
  } catch (error) {
    estado('estado-mensajes', `No se pudo confirmar el guardado: ${error.message} El texto se conserva. Si se perdió la respuesta, actualice la lista antes de reenviar.`, true);
  } finally {
    guardadoEnCurso = false;
    bloquearMensajes(false);
  }
}

// Consulta manual independiente. Una API antigua puede devolver 404 durante
// la transición; ni las visitas, ni el marcador, ni el muro dependen de esta ficha.
async function consultarEquipo() {
  if (equipoEnCurso) return;
  equipoEnCurso = true;
  elemento('btn-equipo').disabled = true;
  estado('ficha-equipo', 'Consultando la ficha oficial del equipo…');

  try {
    const datos = await solicitar('/api/equipo');
    if (!datos || typeof datos.equipo !== 'string' || typeof datos.servidor !== 'string' || typeof datos.zona !== 'string') {
      throw new Error('La ficha recibida no contiene la identidad del servidor.');
    }
    estado('ficha-equipo', `${datos.liga} · ${datos.equipo} · Servidor: ${datos.servidor} · Zona: ${datos.zona} · Versión: ${datos.version}. ${datos.mensaje}`);
  } catch (error) {
    const detalle = error.status === 404
      ? 'La ficha oficial aún no está disponible en este servidor. Puede estar pendiente la actualización de la API.'
      : `No se pudo consultar la ficha: ${error.message}`;
    estado('ficha-equipo', `${detalle} La cancha sigue mostrando el equipo según la zona de su última visita.`, error.status !== 404);
  } finally {
    equipoEnCurso = false;
    elemento('btn-equipo').disabled = false;
  }
}

elemento('btn-preguntar').addEventListener('click', async () => {
  if (visitaEnCurso) return;
  await registrarVisita();
  await actualizarEstadisticas();
});
elemento('btn-mensajes').addEventListener('click', actualizarMensajes);
elemento('formulario').addEventListener('submit', guardarMensaje);
const botonEquipo = elemento('btn-equipo');
if (botonEquipo) botonEquipo.addEventListener('click', consultarEquipo);

async function iniciar() {
  // La primera estadística debe consultarse después de registrar la visita inicial.
  await Promise.all([registrarVisita(), actualizarMensajes()]);
  await actualizarEstadisticas();
  // Sin solapar consultas lentas ni generar visitas artificiales con el temporizador.
  async function repetirEstadisticas() {
    await actualizarEstadisticas();
    setTimeout(repetirEstadisticas, 5000);
  }
  setTimeout(repetirEstadisticas, 5000);
}

iniciar();
