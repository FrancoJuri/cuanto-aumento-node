import axios from 'axios';
import { supabase } from '../config/supabase.js';
import pLimit from 'p-limit';
import httpClient from './httpClient.js';
/**
 * Obtiene o crea el ID del supermercado
 */
async function getSupermarketId(name) {
  // Intentar buscar
  const { data, error } = await supabase
    .from('supermarkets')
    .select('id')
    .eq('name', name)
    .single();
  if (data) return data.id;
  // Si no existe, crear
  console.log(`⚠️ Supermercado '${name}' no encontrado, creando...`);
  const { data: newData, error: insertError } = await supabase
    .from('supermarkets')
    .insert([{ name: name }])
    .select()
    .single();
    
  if (insertError) {
    console.error('Error creando supermercado:', insertError);
    return null;
  }
  
  return newData.id;
}
/**
 * Función genérica para scrapear un supermercado VTEX
 * @param {Object} config - Configuración del scraper
 * @param {string} config.supermarketName - Nombre del supermercado (ej: 'Disco')
 * @param {string} config.baseUrl - URL base (ej: 'https://www.disco.com.ar')
 * @param {string[]} config.categories - Lista de categorías a buscar
 * @param {Function} config.onProductFound - Callback async (product, supermarketId) => { saved: boolean, reason?: string }
 * @param {number} [config.count=50] - Cantidad de productos a buscar por query (default: 50)
 */
export async function scrapeVtexSupermarket({ supermarketName, baseUrl, categories, onProductFound, count = 50 }) {
  const sourceName = supermarketName.toLowerCase();
  console.log(`🛒 Iniciando scraper para ${supermarketName}...`);
  
  // Obtener ID del supermercado
  let supermarketId = null;
  if (supabase) {
    supermarketId = await getSupermarketId(supermarketName);
    if (!supermarketId) {
      return { success: false, error: `No se pudo obtener el ID del supermercado ${supermarketName}` };
    }
  } else {
    console.warn('⚠️ Supabase no disponible. Saltando guardado en DB.');
  }
  
  const CONCURRENCY_LIMIT = 30; 
  const limit = pLimit(CONCURRENCY_LIMIT);
  
  console.log(`📋 Buscando en ${categories.length} categorías/items con concurrencia de ${CONCURRENCY_LIMIT}`);
  
  const allProducts = new Map();
  let successfulQueries = 0;
  let savedCount = 0;
  let skippedCount = 0;
  
  // Procesamiento paralelo
  const promises = categories.map((category, index) => {
    return limit(async () => {
      // Log reducido para no llenar la consola si son muchos
      if (categories.length < 50 || index % 50 === 0) {
        console.log(`[${index + 1}/${categories.length}] 🔍 Procesando: "${category}"`);
      }

      const products = await fetchVtexProducts(baseUrl, category, sourceName, count);
      let localSaved = 0;
      let localSkipped = 0;

      if (products.length > 0) {
        for (const product of products) {
          if (!allProducts.has(product.ean)) {
            allProducts.set(product.ean, product);
            
            if (supermarketId && onProductFound) {
              const result = await onProductFound(product, supermarketId);
              if (result === true || result?.saved === true) {
                localSaved++;
              } else if (result?.reason === 'not_in_master') {
                localSkipped++;
              }
            }
          }
        }
        return { success: true, saved: localSaved, skipped: localSkipped, found: products.length };
      }
      return { success: false, saved: 0, skipped: 0, found: 0 };
    });
  });

  const results = await Promise.all(promises);

  // Agregar resultados
  results.forEach(r => {
    if (r.success) successfulQueries++;
    savedCount += r.saved;
    skippedCount += r.skipped;
  });

  const uniqueProducts = Array.from(allProducts.values());
  console.log(`\n🎉 Scraping completado para ${supermarketName}:`);
  console.log(`   📊 Total productos únicos encontrados: ${uniqueProducts.length}`);
  console.log(`   💾 Operaciones exitosas en DB: ${savedCount}`);
  if (skippedCount > 0) {
    console.log(`   ⏭️ Ignorados (ej: no en maestro): ${skippedCount}`);
  }
  return {
    success: true,
    source: sourceName,
    totalProducts: uniqueProducts.length,
    savedProducts: savedCount, 
    skippedProducts: skippedCount,
    timestamp: new Date().toISOString(),
    products: uniqueProducts
  };
}
// Hash VTEX desde variables de entorno
const VTEX_SHA256_HASH = process.env.VTEX_SHA256_HASH;
if (!VTEX_SHA256_HASH) {
  throw new Error('❌ VTEX_SHA256_HASH no está configurado en las variables de entorno');
}
/**
 * Codifica una cadena a Base64
 */
function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}
/**
 * Codifica una cadena para URL
 */
function encodeUrl(str) {
  return encodeURIComponent(str);
}
/**
 * Genera las variables para la query de VTEX
 */
function getVariablesWithQuery(query, count = 60) {
  return {
    productOriginVtex: true,
    simulationBehavior: "default",
    hideUnavailableItems: true,
    fullText: query,
    count: count,
    shippingOptions: [],
    variant: null
  };
}
/**
 * Genera las extensiones con la query para VTEX
 */
function getExtensionsWithQuery(query, count) {
  const variables = getVariablesWithQuery(query, count);
  return {
    persistedQuery: {
      version: 1,
      sha256Hash: VTEX_SHA256_HASH,
      sender: "vtex.store-resources@0.x",
      provider: "vtex.search-graphql@0.x"
    },
    variables: encodeBase64(JSON.stringify(variables))
  };
}
/**
 * Construye los parámetros de query
 */
function encodeQueryParams(params) {
  const queryParams = [];
  for (const [key, value] of Object.entries(params)) {
    queryParams.push(key + "=" + value);
  }
  return "?" + queryParams.join("&");
}
/**
 * Codifica la query completa para la URL
 */
function encodeQuery(query, count) {
  const extensions = JSON.stringify(getExtensionsWithQuery(query, count));
  const params = {
    workspace: "master",
    maxAge: "medium",
    appsEtag: "remove",
    domain: "store",
    locale: "es-AR",
    operationName: "productSuggestions",
    variables: encodeUrl("{}"),
    extensions: encodeUrl(extensions)
  };
  return encodeQueryParams(params);
}
/**
 * Normaliza un producto de la respuesta de VTEX al formato estándar
 */
export function normalizeProduct(rawProduct, baseUrl, source) {
  // Verificaciones de seguridad
  if (!rawProduct.items || rawProduct.items.length === 0) {
    return null;
  }
  
  const item = rawProduct.items[0]; // Tomamos el primer item (SKU) por defecto
  
  if (!item.images || item.images.length === 0) {
    return null;
  }
  if (!rawProduct.priceRange || !rawProduct.priceRange.sellingPrice) {
    return null;
  }
  // Intentar extraer EAN
  let ean = item.ean;
  
  // Si no hay EAN, descartamos el producto
  if (!ean) {
    return null;
  }
  
  // Extraer todas las imágenes
  const images = item.images.map(img => img.imageUrl);

  // Definir seller antes de calcular precios
  // VTEX suele tener commertialOffer.AvailableQuantity o sellers[0].commertialOffer.AvailableQuantity
  const seller = item.sellers?.find(s => s.sellerDefault) || item.sellers?.[0];

  // Precios
  // Cambiamos a usar la oferta comercial del vendedor (commertialOffer) del SKU
  // Esto es más preciso que product.priceRange que puede traer valores de otros SKUs o vendedores.
  let sellingPrice = 0;
  let listPrice = 0;
  
  if (seller && seller.commertialOffer) {
    sellingPrice = seller.commertialOffer.Price;
    // ListPrice en VTEX (Cencosud) viene con un valor erróneo (x82 aprox).
    // Usamos PriceWithoutDiscount que parece ser el correcto.
    listPrice = seller.commertialOffer.PriceWithoutDiscount || sellingPrice;
  } else {
    // Fallback a priceRange si no hay info en seller (raro)
    sellingPrice = rawProduct.priceRange.sellingPrice.lowPrice;
    listPrice = rawProduct.priceRange.listPrice?.lowPrice || sellingPrice;
  }

  // Calculo de precio de referencia (ej: precio x litro)
  // VTEX suele devolver measurementUnit y unitMultiplier en el item
  let referencePrice = null;
  let referenceUnit = item.measurementUnit; // ej: 'un', 'kg', 'lt'

  if (item.unitMultiplier && item.unitMultiplier > 0) {
    // Si el sellingPrice es por la unidad de venta (ej: botella 1.5L sale $1500)
    // y el unitMultiplier es 1.5, el precio por litro sería 1500 / 1.5 = 1000.
    referencePrice = sellingPrice / item.unitMultiplier;
  }

  // Stock / Disponibilidad
  let isAvailable = true;
  if (seller && seller.commertialOffer) {
     isAvailable = seller.commertialOffer.AvailableQuantity > 0;
  }
  
  return {
    ean: ean,
    external_id: rawProduct.productId, // ID de producto en VTEX
    source: source,
    name: rawProduct.productName,
    link: `${baseUrl}/${rawProduct.linkText}/p`,
    image: images[0],
    images: images,
    
    // Campos de precios normalizados
    price: sellingPrice,
    list_price: listPrice,
    reference_price: referencePrice,
    reference_unit: referenceUnit,
    
    is_available: isAvailable,

    // Mantenemos compatibilidad con campos viejos si es necesario, 
    // o simplemente devolvemos este objeto enriquecido.
    brand: rawProduct.brand,
    categories: rawProduct.categories,
    description: rawProduct.description,
    unavailable: !isAvailable // Deprecated, prefer is_available
  };
}
/**
 * Busca productos en una tienda VTEX
 * @param {string} baseUrl - URL base de la tienda (ej: https://www.disco.com.ar)
 * @param {string} query - Término de búsqueda o categoría
 * @param {string} source - Nombre de la fuente (ej: 'disco', 'carrefour')
 * @param {number} [count=50] - Cantidad de resultados
 */
export async function fetchVtexProducts(baseUrl, query, source, count = 50) {
  // Asegurar que baseUrl no tenga barra al final
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const endpoint = `${cleanBaseUrl}/_v/segment/graphql/v1/`;
  const url = endpoint + encodeQuery(query, count);
  try {
    // Usamos httpClient para automanejo de retries y keep-alive
    const response = await httpClient.get(url);
    const data = response.data;
    
    if (data.errors && data.errors.length > 0) {
      throw new Error(`API Error: ${data.errors[0].message}`);
    }
    if (!data.data || !data.data.productSuggestions || !data.data.productSuggestions.products) {
      // A veces VTEX devuelve null si no hay resultados en lugar de array vacío, chequeamos
      return []; 
    }
    const rawProducts = data.data.productSuggestions.products;
    
    const normalizedProducts = rawProducts
      .map(product => normalizeProduct(product, cleanBaseUrl, source))
      .filter(product => product !== null);
    return normalizedProducts;
  } catch (error) {
    // Logueamos solo si no es 404 (que en search suele ser raro, pero por si acaso)
    // Para simplificar, silenciamos un poco los errores "no encontrado" si son muchos en paralelo
    if (error.response?.status !== 404) {
       // console.error(`❌ Error buscando "${query}" en ${source}:`, error.message);
    }
    return [];
  }
}
