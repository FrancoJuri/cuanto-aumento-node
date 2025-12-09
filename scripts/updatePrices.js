import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import { normalizeProduct } from '../cores/vtex.js';

dotenv.config();

// Configuración Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configuración de URLs base de los super
const SUPERMARKET_URLS = {
  'Disco': 'https://www.disco.com.ar',
  'Jumbo': 'https://www.jumbo.com.ar',
  'Vea': 'https://www.vea.com.ar',
  'Dia': 'https://diaonline.supermercadosdia.com.ar',
  'Masonline': 'https://www.masonline.com.ar',
  'Farmacity': 'https://www.farmacity.com',
  'Carrefour': 'https://www.carrefour.com.ar' // Carrefour VTEX might behave differently, but logic is shared
};

/**
 * 1. API RÁPIDA: Busca por ID directo (Opción Preferida)
 */
async function getVtexProductById(baseUrl, externalId, source) {
  try {
    const url = `${baseUrl}/api/catalog_system/pub/products/search?fq=productId:${externalId}`;
    const { data } = await axios.get(url, { timeout: 10000 });

    if (!data || data.length === 0) return null; // Producto no existe o inactivo

    return normalizeProduct(data[0], baseUrl, source);
  } catch (error) {
    if (error.response && error.response.status === 404) {
        return null; 
    }
    console.error(`Error fetching ID ${externalId} from ${baseUrl}:`, error.message);
    return null;
  }
}

/**
 * 2. API FALLBACK: Busca por EAN (Opción de Recuperación)
 */
async function getVtexProductByEan(baseUrl, ean, source) {
    try {
      const url = `${baseUrl}/_v/segment/graphql/v1/?workspace=master&maxAge=medium&appsEtag=remove&domain=store&locale=es-AR&operationName=productSuggestions&variables=%7B%7D&extensions=${encodeURIComponent(JSON.stringify({
          persistedQuery: {
              version: 1,
              sha256Hash: process.env.VTEX_SHA256_HASH,
              sender: "vtex.store-resources@0.x",
              provider: "vtex.search-graphql@0.x"
          },
          variables: Buffer.from(JSON.stringify({
              productOriginVtex: true,
              simulationBehavior: "default",
              hideUnavailableItems: true,
              fullText: ean,
              count: 1,
              shippingOptions: [],
              variant: null
          })).toString('base64')
      }))}`;
  
      const { data } = await axios.get(url, { 
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 15000 
      });

      if (data.errors || !data.data || !data.data.productSuggestions || !data.data.productSuggestions.products || data.data.productSuggestions.products.length === 0) {
          return null;
      }
      
      const rawProduct = data.data.productSuggestions.products[0];
      // Verificar que el EAN coincida, ya que la búsqueda fuzziness puede traer cosas raras
      if (rawProduct.items && rawProduct.items[0].ean !== ean) {
          // A veces los EANs tienen o faltan ceros a la izquierda
          if (parseInt(rawProduct.items[0].ean) !== parseInt(ean)) {
             return null;
          }
      }

      return normalizeProduct(rawProduct, baseUrl, source);
    } catch (error) {
      console.error(`Error fetching EAN ${ean} from ${baseUrl}:`, error.message);
      return null;
    }
  }

/**
 * 3. FUNCIÓN PRINCIPAL DEL CRON
 */
async function runPriceUpdater() {
  console.log('⏰ Iniciando actualización de precios...');

  if (!process.env.VTEX_SHA256_HASH) {
      console.error("❌ FALTA VTEX_SHA256_HASH en .env");
      process.exit(1);
  }

  // A. Obtener un lote de productos "viejos"
  // Esta vez, traemos TAMBIÉN el EAN por si falla el external_id
  const { data: productsToUpdate, error } = await supabase
    .from('supermarket_products')
    .select(`
      id, 
      external_id,
      product_ean,
      price, 
      supermarket_id, 
      supermarkets ( name )
    `)
    .not('supermarkets', 'is', null) // asegurar que trajo el supermercado
    .order('last_checked_at', { ascending: true, nullsFirst: true }) // Los más viejos o nunca revisados primero
    .limit(200); // Lote de 200

  if (error) {
    console.error('Error obteniendo productos:', error);
    return;
  }

  if (productsToUpdate.length === 0) {
    console.log('✅ No hay productos para actualizar.');
    return;
  }

  console.log(`📋 Procesando lote de ${productsToUpdate.length} productos...`);

  let updatedCount = 0;
  let unavailableCount = 0;

  // B. Iterar sobre cada producto
  for (const item of productsToUpdate) {
    const supermarketName = item.supermarkets?.name;
    const baseUrl = SUPERMARKET_URLS[supermarketName];

    if (!baseUrl) {
      console.warn(`⚠️ URL no configurada para ${supermarketName} (ID: ${item.supermarket_id})`);
      continue;
    }

    const ean = item.product_ean; // EAN directo de la tabla

    // Rate Limiting simple
    await new Promise(r => setTimeout(r, 100)); 

    // C. Consultar API VTEX
    let newData = null;

    // C.1. Intentar por ID externo si existe
    if (item.external_id) {
        newData = await getVtexProductById(baseUrl, item.external_id, supermarketName.toLowerCase());
    }

    // C.2. Si falló por ID y tenemos EAN, intentar recuperación por EAN
    if (!newData && ean) {
        // console.log(`   🔄 Recuperando por EAN ${ean} para ${supermarketName}...`);
        newData = await getVtexProductByEan(baseUrl, ean, supermarketName.toLowerCase());
    }

    if (newData) {
      // D. Si encontramos datos frescos
      
      const hasPriceChanged = Math.abs(parseFloat(newData.price) - parseFloat(item.price)) > 0.01;
      
      const updateData = {
        last_checked_at: new Date().toISOString(),
        is_available: newData.is_available,
        list_price: newData.list_price,
        price: newData.price,
        // Si recuperamos por EAN, asegurarnos de guardar el external_id para la próxima ser más rápidos
        external_id: newData.external_id 
      };

      // E. Guardar en DB
      const { error: updateError } = await supabase
        .from('supermarket_products')
        .update(updateData)
        .eq('id', item.id);

      if (!updateError) {
        // F. Si el precio cambió, guardamos en el HISTORIAL
        if (hasPriceChanged) {
          console.log(`💰 Cambio ${supermarketName}: $${item.price} -> $${newData.price} (${ean || item.id})`);
          await supabase.from('price_history').insert({
            supermarket_product_id: item.id,
            price: newData.price,
            list_price: newData.list_price,
            scraped_at: new Date().toISOString()
          });
        }
        updatedCount++;
      } else {
          console.error(`Error actualizando producto ${item.id}:`, updateError.message);
      }

    } else {
        // G. No se encontró el producto (ni por ID ni por EAN)
        // Probablemente descontinuado. Lo marcamos como no disponible.
        unavailableCount++;
        // console.log(`   ❌ No encontrado en ${supermarketName}. Marcando no disponible.`);
        await supabase
            .from('supermarket_products')
            .update({ 
                is_available: false, 
                last_checked_at: new Date().toISOString() 
            })
            .eq('id', item.id);
    }
  }

  console.log(`🏁 Fin del lote. Actualizados: ${updatedCount} | No Disponibles: ${unavailableCount}`);
}

// Ejecutar
runPriceUpdater();