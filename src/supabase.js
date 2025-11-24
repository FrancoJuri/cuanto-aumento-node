import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let client = null;

if (supabaseUrl && supabaseKey) {
  client = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('⚠️ Advertencia: SUPABASE_URL o SUPABASE_KEY no configurados. La base de datos no estará disponible.');
}

export const supabase = client;
