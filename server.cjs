require('dotenv').config();

// En algunas redes Windows, Node intenta primero una ruta IPv6 que no llega
// correctamente a Supabase. Priorizamos IPv4 para evitar errores de fetch.
require('dns').setDefaultResultOrder('ipv4first');

const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const puerto = 3000;

const esperar = (milisegundos) =>
  new Promise((resolver) => setTimeout(resolver, milisegundos));

// Algunas conexiones de red interrumpen ocasionalmente el primer intento HTTPS.
// Supabase recibe el mismo pedido hasta tres veces antes de informar un error.
async function fetchConReintento(url, opciones) {
  let ultimoError;

  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      return await fetch(url, opciones);
    } catch (error) {
      ultimoError = error;

      if (intento < 3) {
        await esperar(500 * intento);
      }
    }
  }

  throw ultimoError;
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY en el archivo .env'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  {
    global: {
      fetch: fetchConReintento
    }
  }
);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/cuenta/:dni', async (req, res) => {
  const dni = String(req.params.dni || '').trim();

  if (!/^\d{7,8}$/.test(dni)) {
    return res.status(400).json({
      error: 'Ingresá un DNI válido de 7 u 8 números.'
    });
  }

  try {
    const { data: alumno, error: errorAlumno } = await supabase
      .from('alumnos')
      .select('id, dni, nombre, apellido, carrera, curso')
      .eq('dni', dni)
      .maybeSingle();

    if (errorAlumno) {
      throw errorAlumno;
    }

    if (!alumno) {
      return res.status(404).json({
        error: 'No encontramos una cuenta asociada a ese DNI.'
      });
    }

    const { data: cuotas, error: errorCuotas } = await supabase
      .from('cuotas')
      .select('id, alumno_id, concepto, vencimiento, importe, pagado')
      .eq('alumno_id', alumno.id)
      .order('vencimiento', { ascending: true });

    if (errorCuotas) {
      throw errorCuotas;
    }

    return res.json({
      alumno,
      cuotas: cuotas || []
    });
  } catch (error) {
    console.error(error);
    if (error.cause) {
      console.error('Causa de conexión:', error.cause);
    }

    return res.status(500).json({
      error: error.message || 'No se pudo consultar la cuenta.'
    });
  }
});
// ... (todo tu código anterior se queda igual hasta aquí)

// ✅ EXPORTAR la app para que Vercel pueda usarla
module.exports = app;

// ✅ Solo iniciar el servidor localmente si NO estamos en Vercel (producción)
if (process.env.NODE_ENV !== 'production') {
  app.listen(puerto, () => {
    console.log(`Servidor corriendo en http://localhost:${puerto}`);
  });
}
