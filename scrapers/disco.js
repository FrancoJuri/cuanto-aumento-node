import { supabase } from '../src/supabase.js';
import { scrapeVtexSupermarket } from './vtex.js';

// 🎯 CATEGORÍAS PRINCIPALES DEL SUPERMERCADO
// 🎯 LISTA ESPECÍFICA DE PRODUCTOS (SUBCATEGORÍAS REALES)
const SPECIFIC_PRODUCT_QUERIES = [
  // ALMACÉN
  'Aceites y Vinagres', 'Aderezos', 'Arroz y Legumbres', 'Conservas', 
  'Desayuno y Merienda', 'Golosinas y Chocolates', 'Harinas', 'Panificados', 
  'Para Preparar', 'Pastas Secas y Salsas', 'Sal, Pimienta y Especias', 
  'Snacks', 'Sopas, Caldos y Puré',

  // BEBIDAS
  'A Base de Hierbas', 'Aguas', 'Aperitivos', 'Cervezas', 'Champagnes', 
  'Energizantes', 'Bebidas Blancas', 'Gaseosas', 'Hielo', 'Isotónicas', 
  'Jugos', 'Licores', 'Sidras', 'Vinos', 'Whiskys',

  // FRESCOS (Lácteos, Quesos, Fiambres, Pastas)
  'Cremas', 'Dulce de Leche', 'Leches', 'Mantecas y Margarinas', 
  'Pastas y Tapas', 'Quesos', 'Yogures',
  'Dulces', 'Encurtidos, Aceitunas y Pickles', 'Fiambres', 'Salchichas',
  'Pastas Frescas Simples', 'Pastas Frescas Rellenas', 'Salsa y Quesos',

  // LIMPIEZA
  'Accesorios de Limpieza', 'Calzado', 'Cuidado Para La Ropa', 
  'Desodorantes de Ambiente', 'Insecticidas', 'Lavandina', 'Limpieza de Baño', 
  'Limpieza de Cocina', 'Limpieza de Pisos y Muebles', 'Papeles',

  // PERFUMERÍA
  'Cuidado Capilar', 'Cuidado de la Piel', 'Cuidado Oral', 'Cuidado Personal', 'Farmacia'
];

const BASE_URL = 'https://www.disco.com.ar';

/**
 * Lógica específica de guardado para Disco (MAESTRO)
 * Upsert Producto + Insert Precio
 */
async function saveDiscoProduct(product, supermarketId) {
  try {
    // 1. Upsert Producto (Maestro)
    const { error: productError } = await supabase
      .from('products')
      .upsert({
        ean: product.ean,
        name: product.name,
        description: product.description || product.name,
        brand: product.brand,
        image_url: product.image,
        images: product.images,
        category: product.categories && product.categories.length > 0 ? product.categories[0] : null
      }, { onConflict: 'ean' });

    if (productError) {
      console.error(`❌ Error guardando producto ${product.ean}:`, productError.message);
      return { saved: false, reason: 'db_error' };
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
export async function getDiscoMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Disco',
    baseUrl: BASE_URL,
    categories: SPECIFIC_PRODUCT_QUERIES,
    onProductFound: saveDiscoProduct,
    count: 50
  });
}
