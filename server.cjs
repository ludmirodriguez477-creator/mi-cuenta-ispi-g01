// Forzar IPv4 para evitar problemas de conexión con Supabase en algunas redes
require('dns').setDefaultResultOrder('ipv4first');

const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const puerto = process.env.PORT || 3000;

const esperar = (milisegundos) =>
  new Promise((resolver) => setTimeout(resolver, milisegundos));

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

// Verificar variables de entorno (Sin lanzar error fatal para poder depurar)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
  console.error('⚠️ ADVERTENCIA: Faltan variables de entorno de Supabase en Vercel.');
}

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_PUBLISHABLE_KEY || '',
  {
    global: {
      fetch: fetchConReintento
    }
  }
);

app.use(express.static(path.join(__dirname, 'public')));

// ✅ RUTA DE PRUEBA: Para verificar que el servidor y las variables funcionan
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    variablesCargadas: {
      url: !!process.env.SUPABASE_URL,
      key: !!process.env.SUPABASE_PUBLISHABLE_KEY
    }
  });
});

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

    if (errorAlumno) throw errorAlumno;

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

    if (errorCuotas) throw errorCuotas;

    return res.json({ alumno, cuotas: cuotas || [] });
  } catch (error) {
    console.error('Error en /api/cuenta:', error);
    return res.status(500).json({
      error: error.message || 'No se pudo consultar la cuenta.'
    });
  }
});

// ✅ EXPORTAR la app para que Vercel la use como Serverless Function
module.exports = app;

// ✅ Solo escuchar en puerto local si NO estamos en producción (Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.listen(puerto, () => {
    console.log(`Servidor corriendo en http://localhost:${puerto}`);
  });
}