-- Campo opcional para registrar la fecha efectiva de cada pago.
-- Seguro para aplicar: no borra ni modifica cuotas existentes y no inventa
-- fechas para pagos históricos. Completarlo al registrar cada pago.
alter table public.cuotas
  add column if not exists fecha_pago date;
