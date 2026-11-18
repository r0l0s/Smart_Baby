// Cliente de Supabase (solo el backend lo usa, con la clave service_role).
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const BUCKET_FOTOS = 'fotos-seguridad';

export const supabase =
  config.supabaseUrl && config.supabaseKey
    ? createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } })
    : null;

// Crea el bucket de fotos si todavía no existe.
export async function prepararStorage() {
  if (!supabase) return;
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('[supabase] No se pudieron listar los buckets:', error.message);
    return;
  }
  if (buckets.some((b) => b.name === BUCKET_FOTOS)) return;
  const { error: errCrear } = await supabase.storage.createBucket(BUCKET_FOTOS, { public: true });
  if (errCrear) console.error('[supabase] No se pudo crear el bucket:', errCrear.message);
  else console.log(`[supabase] Bucket "${BUCKET_FOTOS}" creado`);
}

// Revisa que Supabase responda y que el esquema exista. Devuelve un texto corto.
export async function estadoSupabase() {
  if (!supabase) return 'sin configurar (falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)';
  // Consulta real (no "head"): una consulta solo-conteo no da error si la tabla no existe.
  const { error } = await supabase.from('usuarios').select('id').limit(1);
  if (error?.code === 'PGRST205') return 'error: faltan las tablas — ejecuta db/schema.sql en Supabase';
  return error ? `error: ${error.message}` : 'ok';
}
