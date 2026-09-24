const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let datosCuenta = null;
let toastTimer;
let historialPantallas = [];

const tabs = {
  login: '#s-login',
  inicio: '#s-inicio',
  estado: '#s-estado',
  pagos: '#s-pagos',
  historial: '#s-historial',
  perfil: '#s-perfil'
};

const SUPABASE_URL = 'https://ixjdjsotrjuxdsbdertr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QeeXRw8hM6MSGyFHPmbJDQ_XYG6D3Ws';

async function consultarCuentaEnSupabase(dni) {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
  };

  const alumnoRespuesta = await fetch(
    `${SUPABASE_URL}/rest/v1/alumnos?select=id,dni,nombre,apellido,carrera,curso&dni=eq.${encodeURIComponent(dni)}&limit=1`,
    { headers }
  );

  const alumnos = await alumnoRespuesta.json();

  if (!alumnoRespuesta.ok) {
    throw new Error(alumnos.message || 'No se pudo consultar la cuenta.');
  }

  const alumno = alumnos[0];

  if (!alumno) {
    return { alumno: null, cuotas: [] };
  }

  const filtroCuotas = `&alumno_id=eq.${encodeURIComponent(alumno.id)}&order=vencimiento.asc`;
  let cuotasRespuesta = await fetch(
    `${SUPABASE_URL}/rest/v1/cuotas?select=id,alumno_id,concepto,vencimiento,importe,pagado,fecha_pago${filtroCuotas}`,
    { headers }
  );
  let cuotas = await cuotasRespuesta.json();

  // Si todavía no existe fecha_pago en la tabla, conservamos compatibilidad
  // con el esquema actual y seguimos mostrando cuotas y vencimientos.
  if (!cuotasRespuesta.ok && /fecha_pago|column/i.test(cuotas.message || '')) {
    cuotasRespuesta = await fetch(
      `${SUPABASE_URL}/rest/v1/cuotas?select=id,alumno_id,concepto,vencimiento,importe,pagado${filtroCuotas}`,
      { headers }
    );
    cuotas = await cuotasRespuesta.json();
  }

  if (!cuotasRespuesta.ok) {
    throw new Error(cuotas.message || 'No se pudieron consultar las cuotas.');
  }

  return { alumno, cuotas };
}

// ✅ NUEVA FUNCIÓN: Calcula los totales a partir del array de cuotas
function procesarDatosCuenta(alumno, cuotas) {
  if (!alumno) return null;

  let saldo = 0;
  let pagosRealizados = 0;
  let cuotasPendientes = 0;
  let proximoVencimiento = '-';

  if (cuotas && Array.isArray(cuotas)) {
    cuotas.forEach(cuota => {
      if (cuota.pagado === true) {
        pagosRealizados++;
      } else {
        cuotasPendientes++;
        saldo += Number(cuota.importe) || 0;
        
        // Como la consulta a Supabase ya ordena por vencimiento.asc,
        // la primera cuota pendiente que encontramos es la más próxima.
        if (proximoVencimiento === '-' && cuota.vencimiento) {
          const fecha = new Date(cuota.vencimiento + 'T00:00:00'); // T00:00:00 evita problemas de zona horaria
          if (!isNaN(fecha.getTime())) {
            proximoVencimiento = fecha.toLocaleDateString('es-AR');
          } else {
            proximoVencimiento = cuota.vencimiento;
          }
        }
      }
    });
  }

  return {
    ...alumno,
    cuotas, // Mantenemos el array por si otras pestañas (historial/pagos) lo necesitan
    saldo,
    pagosRealizados,
    cuotasPendientes,
    proximoVencimiento
  };
}

function toast(mensaje) {
  const toastEl = $('#toast');
  if (!toastEl) return;

  toastEl.textContent = mensaje;
  toastEl.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

function mostrarPantalla(selector) {
  $$('.screen').forEach((pantalla) => {
    pantalla.classList.remove('active');
  });

  const pantalla = $(selector);
  if (pantalla) {
    pantalla.classList.add('active');
  }

  window.scrollTo(0, 0);
}

function setTab(tabName, guardarEnHistorial = true) {
  const selector = tabs[tabName];
  if (!selector) return;

  const actual = Object.entries(tabs)
    .find(([, pantalla]) => $(pantalla)?.classList.contains('active'))?.[0];
  if (guardarEnHistorial && actual && actual !== tabName) {
    historialPantallas.push(actual);
  }

  mostrarPantalla(selector);

  $$('#nav .tab').forEach((boton) => {
    boton.classList.toggle('active', boton.dataset.tab === tabName);
  });
}

function volverAtras() {
  const anterior = historialPantallas.pop() || 'inicio';
  setTab(anterior, false);
}

function formatoMonto(monto) {
  return `$ ${Number(monto || 0).toLocaleString('es-AR')}`;
}

function formatoFecha(fecha) {
  if (!fecha) return '';
  const valor = String(fecha);
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const parsed = new Date(valor);
  return Number.isNaN(parsed.getTime()) ? valor : parsed.toLocaleDateString('es-AR');
}

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function crearFilaCuota(cuota, tipo = 'estado') {
  const fila = document.createElement('article');
  fila.className = 'cuota';
  const info = document.createElement('div');
  info.className = 'cuota-info';
  const concepto = document.createElement('b');
  concepto.textContent = cuota.concepto || 'Cuota';
  const vencimiento = document.createElement('small');
  vencimiento.textContent = `Vencimiento: ${formatoFecha(cuota.vencimiento) || 'Sin fecha'}`;
  info.append(concepto, vencimiento);

  if (cuota.pagado === true) {
    const fechaPago = document.createElement('small');
    fechaPago.className = 'fecha-pago';
    fechaPago.textContent = cuota.fecha_pago
      ? `Pagada el ${formatoFecha(cuota.fecha_pago)}`
      : 'Pago registrado; fecha no informada';
    info.append(fechaPago);
  }

  const lado = document.createElement('div');
  lado.className = 'cuota-lado';
  const importe = document.createElement('span');
  importe.className = 'cuota-importe';
  importe.textContent = formatoMonto(cuota.importe);
  lado.append(importe);
  const estado = document.createElement('span');
  estado.className = `estado-cuota ${cuota.pagado ? 'estado-pagada' : 'estado-pendiente'}`;
  estado.textContent = cuota.pagado ? 'Pagada' : 'Pendiente';
  lado.append(estado);

  if (cuota.pagado === true && (tipo === 'historial' || tipo === 'estado')) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'comprobante-btn';
    boton.textContent = 'Imprimir / guardar PDF';
    boton.addEventListener('click', () => descargarConstancia(cuota));
    lado.append(boton);
  }
  fila.append(info, lado);
  return fila;
}

function mostrarVacio(contenedor, mensaje) {
  const texto = document.createElement('p');
  texto.className = 'empty';
  texto.textContent = mensaje;
  contenedor.replaceChildren(texto);
}

function renderizarCuotas(datos) {
  const cuotas = Array.isArray(datos.cuotas) ? datos.cuotas : [];
  const pagadas = cuotas.filter((cuota) => cuota.pagado === true);
  const pendientes = cuotas.filter((cuota) => cuota.pagado !== true);
  [
    ['#listaCuotas', cuotas, 'No hay cuotas cargadas.', 'estado'],
    ['#listaPagos', pendientes, 'No hay cuotas pendientes.', 'pagos'],
    ['#historialPagos', pagadas, 'Todavía no hay pagos registrados.', 'historial']
  ].forEach(([selector, lista, vacio, tipo]) => {
    const contenedor = $(selector);
    if (!contenedor) return;
    if (!lista.length) return mostrarVacio(contenedor, vacio);
    contenedor.replaceChildren(...lista.map((cuota) => crearFilaCuota(cuota, tipo)));
  });

  const recientes = [...cuotas]
    .sort((a, b) => String(b.fecha_pago || b.vencimiento || '').localeCompare(String(a.fecha_pago || a.vencimiento || '')))
    .slice(0, 3);
  const movimientos = $('#movimientosInicio');
  if (!movimientos) return;
  if (!recientes.length) return mostrarVacio(movimientos, 'No hay movimientos para mostrar.');
  movimientos.replaceChildren(...recientes.map((cuota) => {
    const fila = document.createElement('div');
    fila.className = 'mov';
    const icono = document.createElement('span');
    icono.className = 'mic';
    icono.textContent = cuota.pagado ? '✓' : '📅';
    const detalle = document.createElement('div');
    const nombre = document.createElement('b');
    nombre.textContent = cuota.concepto || 'Cuota';
    const fecha = document.createElement('small');
    const fechaMostrar = cuota.pagado ? cuota.fecha_pago : cuota.vencimiento;
    fecha.textContent = `${cuota.pagado ? 'Pago' : 'Vence'}: ${formatoFecha(fechaMostrar) || (cuota.pagado ? 'Fecha no informada' : 'Sin fecha')}`;
    detalle.append(nombre, document.createElement('br'), fecha);
    const monto = document.createElement('span');
    monto.className = 'amt';
    monto.textContent = formatoMonto(cuota.importe);
    fila.append(icono, detalle, monto);
    return fila;
  }));
}

function descargarConstancia(cuota) {
  if (!datosCuenta || cuota.pagado !== true) {
    toast('Solo se generan constancias de pagos registrados.');
    return;
  }
  const nombre = [datosCuenta.nombre, datosCuenta.apellido].filter(Boolean).join(' ') || 'Estudiante';
  const fechaPago = cuota.fecha_pago ? formatoFecha(cuota.fecha_pago) : 'No informada en el sistema';
  const contenido = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Constancia de pago</title>
  <style>body{font:16px Arial,sans-serif;color:#202637;max-width:720px;margin:48px auto;padding:24px}header{border-bottom:4px solid #0b57c2;padding-bottom:16px}h1{color:#142b7c}dt{font-weight:bold;margin-top:18px}dd{margin:5px 0}.nota{margin-top:32px;padding:14px;background:#f4f6f9;border-radius:8px;font-size:13px}.pie{margin-top:44px;color:#6b7280;font-size:12px}</style>
  <header><strong>ISPI 4019 · SAN JUAN BAUTISTA</strong><h1>Constancia informativa de pago</h1></header>
  <p>El sistema registra como pagada la cuota indicada:</p><dl>
  <dt>Estudiante</dt><dd>${escaparHtml(nombre)}</dd><dt>DNI</dt><dd>${escaparHtml(datosCuenta.dni || 'No disponible')}</dd>
  <dt>Concepto</dt><dd>${escaparHtml(cuota.concepto || 'Cuota')}</dd><dt>Importe</dt><dd>${escaparHtml(formatoMonto(cuota.importe))}</dd>
  <dt>Fecha de pago registrada</dt><dd>${escaparHtml(fechaPago)}</dd><dt>Vencimiento</dt><dd>${escaparHtml(formatoFecha(cuota.vencimiento) || 'No informado')}</dd></dl>
  <p class="nota">Documento informativo generado a partir del estado registrado en el sistema. No reemplaza un recibo oficial emitido por la institución.</p>
  <p class="pie">Generado el ${escaparHtml(new Date().toLocaleString('es-AR'))}</p></html>`;
  const ventana = window.open('', '_blank');
  if (!ventana) {
    toast('Permití las ventanas emergentes para imprimir o guardar el comprobante.');
    return;
  }
  ventana.document.open();
  ventana.document.write(contenido);
  ventana.document.close();
  setTimeout(() => {
    if (!ventana.closed) {
      ventana.focus();
      ventana.print();
    }
  }, 300);
}

function cargarDatos(datos) {
  const nombreCompleto = [
    datos.nombre || '',
    datos.apellido || ''
  ].join(' ').trim() || 'Usuario';

  const saldo = formatoMonto(datos.saldo);

  if ($('#saldoInicio')) $('#saldoInicio').textContent = saldo;
  if ($('#saldo')) $('#saldo').textContent = saldo;
  if ($('#nombreAlumno')) $('#nombreAlumno').textContent = nombreCompleto;
  
  // ✅ CORRECCIÓN: La guía no menciona "legajo", usamos carrera y curso que sí existen en la BD
  if ($('#datosAlumno')) {
    $('#datosAlumno').textContent = (datos.carrera && datos.curso)
      ? `${datos.carrera} · ${datos.curso}º Año`
      : 'Estudiante';
  }

  if ($('#perfilNombre')) $('#perfilNombre').textContent = nombreCompleto;
  
  if ($('#perfilDatos')) {
    $('#perfilDatos').textContent = (datos.carrera && datos.curso)
      ? `${datos.carrera} · ${datos.curso}º Año`
      : 'Estudiante';
  }

  if ($('#perfilDni')) $('#perfilDni').textContent = datos.dni || '-';
  if ($('#perfilCarrera')) $('#perfilCarrera').textContent = datos.carrera || '-';
  if ($('#perfilCurso')) $('#perfilCurso').textContent = datos.curso || '-';
  if ($('#cantidadPagos')) $('#cantidadPagos').textContent = datos.pagosRealizados || 0;
  if ($('#cantidadPendientes')) $('#cantidadPendientes').textContent = datos.cuotasPendientes || 0;
  if ($('#proximoVencimiento')) $('#proximoVencimiento').textContent = datos.proximoVencimiento || '-';
  renderizarCuotas(datos);
}

const menu = $('#nav');
const menuBackdrop = $('#menuBackdrop');
const menuTriggers = $$('.menu-trigger');
const menuClose = $('.menu-close');

function cerrarMenu() {
  document.body.classList.remove('menu-open');
  menu?.setAttribute('aria-hidden', 'true');
  menuTriggers.forEach((boton) => boton.setAttribute('aria-expanded', 'false'));
}

function abrirMenu() {
  document.body.classList.add('menu-open');
  menu?.setAttribute('aria-hidden', 'false');
  menuTriggers.forEach((boton) => boton.setAttribute('aria-expanded', 'true'));
  menuClose?.focus();
}

menuTriggers.forEach((boton) => boton.addEventListener('click', abrirMenu));
$$('.back-trigger').forEach((boton) => boton.addEventListener('click', volverAtras));
menuClose?.addEventListener('click', cerrarMenu);
menuBackdrop?.addEventListener('click', cerrarMenu);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cerrarMenu();
});

const temaOscuroGuardado = localStorage.getItem('mi-cuenta-tema') === 'oscuro';
const themeToggle = $('#themeToggle');
function aplicarTemaOscuro(activo) {
  document.body.classList.toggle('dark', activo);
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', String(activo));
    themeToggle.innerHTML = activo
      ? '<span aria-hidden="true">☀</span><span>Usar tema claro</span>'
      : '<span aria-hidden="true">☾</span><span>Activar tema oscuro</span>';
  }
  localStorage.setItem('mi-cuenta-tema', activo ? 'oscuro' : 'claro');
}
aplicarTemaOscuro(temaOscuroGuardado);
themeToggle?.addEventListener('click', () => {
  aplicarTemaOscuro(!document.body.classList.contains('dark'));
});
$('#logoutButton')?.addEventListener('click', salir);

$$('#nav .tab').forEach((boton) => {
  boton.addEventListener('click', () => {
    setTab(boton.dataset.tab);
    cerrarMenu();
  });
});

$$('[data-go]').forEach((elemento) => {
  elemento.addEventListener('click', (event) => {
    event.preventDefault();
    setTab(elemento.dataset.go);
  });
});

const loginForm = $('#loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const dni = $('#user')?.value.trim() || '';
    const mensajeEl = $('#mensaje');

    if (mensajeEl) mensajeEl.textContent = '';

    if (!/^\d{7,8}$/.test(dni)) {
      const mensaje = 'Ingresá un DNI válido de 7 u 8 números.';
      if (mensajeEl) mensajeEl.textContent = mensaje;
      toast(mensaje);
      return;
    }

    toast('Consultando cuenta...');

    try {
      const respuestaCuenta = await consultarCuentaEnSupabase(dni);

      if (!respuestaCuenta.alumno) {
        const mensaje = 'No encontramos una cuenta asociada a ese DNI.';
        if (mensajeEl) mensajeEl.textContent = mensaje;
        toast(mensaje);
        return;
      }

      // ✅ CORRECCIÓN PRINCIPAL: Procesamos los datos para calcular los totales
      const datosProcesados = procesarDatosCuenta(respuestaCuenta.alumno, respuestaCuenta.cuotas);
      
      datosCuenta = datosProcesados;
      cargarDatos(datosProcesados); // Ahora le pasamos el objeto con los cálculos ya hechos

      document.body.classList.add('logged');
      setTab('inicio');
      toast(`¡Bienvenido/a, ${datosProcesados.nombre || 'usuario'}! 👋`);
      
    } catch (error) {
      console.error('Error de conexión:', error);
      const mensaje = 'No se pudo conectar con el servidor.';
      if (mensajeEl) mensajeEl.textContent = mensaje;
      toast(mensaje);
    }
  });
}

function salir() {
  document.body.classList.remove('logged');
  datosCuenta = null;

  if ($('#user')) $('#user').value = '';
  if ($('#mensaje')) $('#mensaje').textContent = '';

  historialPantallas = [];
  setTab('login', false);
  cerrarMenu();
  toast('Sesión cerrada correctamente');
}