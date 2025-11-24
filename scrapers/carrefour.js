import { supabase } from '../src/supabase.js';
import { scrapeVtexSupermarket } from './vtex.js';

// 🎯 CATEGORÍAS PRINCIPALES DEL SUPERMERCADO
const MAIN_PRODUCT_CATEGORIES = [
  'almacen',
  'bebidas', 
  'limpieza',
  'lacteos',
  'productos frescos',
  'panaderia',
  'congelados',
  'frutas y verduras',
  'carnes y pescados',
  'desayuno y merienda',
  'perfumeria'
];

const BASE_URL = 'https://www.carrefour.com.ar';

/**
 * Lógica específica de guardado para Carrefour (FOLLOWER)
 * Solo guarda precio si el producto ya existe en DB
 */
async function saveCarrefourProduct(product, supermarketId) {
  try {
    // 1. Verificar si el producto existe en nuestra DB (Maestro)
    const { data: existingProduct, error: findError } = await supabase
      .from('products')
      .select('ean')
      .eq('ean', product.ean)
      .single();

    if (findError || !existingProduct) {
      return { saved: false, reason: 'not_in_master' };
    }

    // 2. Insertar Precio
    const { error: priceError } = await supabase
      .from('prices')
      .insert({
        product_ean: product.ean,
        supermarket_id: supermarketId,
        price: product.price,
        scraped_at: new Date().toISOString()
      });

    if (priceError) {
      console.error(`❌ Error guardando precio para ${product.ean}:`, priceError.message);
      return { saved: false, reason: 'db_error' };
    }

    return { saved: true };
  } catch (error) {
    console.error(`❌ Error general guardando ${product.ean}:`, error.message);
    return { saved: false, reason: 'exception' };
  }
}

/**
 * 🎯 FUNCIÓN PRINCIPAL
 */
export async function getCarrefourMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Carrefour',
    baseUrl: BASE_URL,
    categories: MAIN_PRODUCT_CATEGORIES,
    onProductFound: saveCarrefourProduct
  });
}