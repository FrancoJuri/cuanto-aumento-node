import { supabase } from '../config/supabase.js';

/**
 * @returns {Promise<string[]>}
 */
export async function getAllProductEans() {
  console.log('🔄 Obteniendo EANs de la base de datos...');
  
  let allEans = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('products')
      .select('ean')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Error obteniendo EANs:', error.message);
      throw error;
    }

    if (data.length > 0) {
      const eans = data.map(p => p.ean).filter(ean => ean); 
      allEans = allEans.concat(eans);
      
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  
  const uniqueEans = [...new Set(allEans)];
  
  console.log(`✅ ${uniqueEans.length} obtained.`);
  return uniqueEans;
}
