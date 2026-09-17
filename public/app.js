const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let datosCuenta = null;
let toastTimer;

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

  const cuotasRespuesta = await fetch(
    `${SUPABASE_URL}/rest/v1/cuotas?select=id,alumno_id,concepto,vencimiento,importe,pagado&alumno_id=eq.${encodeURIComponent(alumno.id)}&order=vencimiento.asc`,
    { headers }
  );

  const cuotas = await cuotasRespuesta.json();

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

function setTab(tabName) {
  const selector = tabs[tabName];
  if (!selector) return;

  mostrarPantalla(selector);

  $$('#nav .tab').forEach((boton) => {
    boton.classList.toggle('active', boton.dataset.tab === tabName);
  });
}

function formatoMonto(monto) {
  return `$ ${Number(monto || 0).toLocaleString('es-AR')}`;
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
}

$$('#nav .tab').forEach((boton) => {
  boton.addEventListener('click', () => {
    setTab(boton.dataset.tab);
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

  setTab('login');
  toast('Sesión cerrada correctamente');
}