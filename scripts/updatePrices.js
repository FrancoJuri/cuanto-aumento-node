import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import { normalizeProduct } from '../cores/vtex.js';
import pLimit from 'p-limit';
import httpClient from '../cores/httpClient.js';

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
 * Busca producto por EAN
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
  
      const { data } = await httpClient.get(url);

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
  const startTime = Date.now();
  console.log('⏰ Iniciando actualización de precios...');
  console.log(`🕐 Hora de inicio: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);

  if (!process.env.VTEX_SHA256_HASH) {
      console.error("❌ FALTA VTEX_SHA256_HASH en .env");
      process.exit(1);
  }

  // A. Obtener un lote de productos "viejos"
  const TARGET_TOTAL = 2500;
  let productsToUpdate = [];
  let page = 0;
  let hasMore = true;

  console.log(`📥 Buscando hasta ${TARGET_TOTAL} productos para actualizar...`);

  // Loop para superar el limite de 1000 rows de Supabase
  while (hasMore && productsToUpdate.length < TARGET_TOTAL) {
    const remaining = TARGET_TOTAL - productsToUpdate.length;
    // Si quedan menos de 1000 por pedir, pedimos solo esos. Si quedan más, pedimos 1000.
    const limit = Math.min(remaining, 1000); 
    
    // Pagination (0-indexed page based on 1000 items per "full" page logic)
    // Always step by 1000 to keep alignment consistent with Supabase pagination if needed, 
    // though here we are just grabbing chunks.
    const from = page * 1000;
    const to = from + limit - 1;

    const { data, error } = await supabase
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
      .range(from, to); 

    if (error) {
      console.error('Error obteniendo productos (batch ' + page + '):', error.message);
      // Si falla un batch, detenemos la carga pero procesamos lo que ya tengamos
      break; 
    }

    if (data && data.length > 0) {
      productsToUpdate = productsToUpdate.concat(data);
      page++;
      
      // Si nos devolvió menos de lo que pedimos (limit), es que no hay más
      if (data.length < limit) {
        hasMore = false; 
      }
    } else {
      hasMore = false;
    }
  }

  if (productsToUpdate.length === 0) {
    console.log('✅ No hay productos para actualizar.');
    return;
  }

  console.log(`📋 Procesando lote de ${productsToUpdate.length} productos...`);

  let updatedCount = 0;
  let unavailableCount = 0;
  let priceChangedCount = 0;
  let errorCount = 0;

  // B. Función auxiliar para dividir en batches


  // C. Función para procesar un producto individual
  const processProduct = async (item, index, total) => {
    const supermarketName = item.supermarkets?.name;
    const baseUrl = SUPERMARKET_URLS[supermarketName];

    if (!baseUrl) {
      console.warn(`⚠️ URL no configurada para ${supermarketName} (ID: ${item.supermarket_id})`);
      return { success: false, reason: 'no_url' };
    }

    const ean = item.product_ean;
    
    console.log(`[${index + 1}/${total}] 🔍 ${supermarketName} | EAN: ${ean}`);

    // Consultar API VTEX por EAN
    let newData = null;

    if (ean) {
        newData = await getVtexProductByEan(baseUrl, ean, supermarketName.toLowerCase());
        if (newData) {
            console.log(`   ✅ Encontrado - Precio: $${newData.price}`);
        } else {
            console.log(`   ❌ No encontrado`);
        }
    } else {
        console.log(`   ⚠️  Producto sin EAN, saltando...`);
        return { success: false, reason: 'no_ean' };
    }

    if (newData) {
      // Si encontramos datos frescos
      const hasPriceChanged = Math.abs(parseFloat(newData.price) - parseFloat(item.price)) > 0.01;
      
      const updateData = {
        last_checked_at: new Date().toISOString(),
        is_available: newData.is_available,
        list_price: newData.list_price,
        price: newData.price,
        reference_price: newData.reference_price,
        reference_unit: newData.reference_unit,
        external_id: newData.external_id,
        sku_id: newData.sku_id || null,
        seller_id: newData.seller_id || null,
        seller_name: newData.seller_name || null
      };

      // Guardar en DB
      const { error: updateError } = await supabase
        .from('supermarket_products')
        .update(updateData)
        .eq('id', item.id);

      if (!updateError) {
        // Si el precio cambió, guardamos en el HISTORIAL
        if (hasPriceChanged) {
          console.log(`   💰 Cambio de precio: $${item.price} -> $${newData.price}`);
          await supabase.from('price_history').insert({
            supermarket_product_id: item.id,
            price: newData.price,
            list_price: newData.list_price,
            scraped_at: new Date().toISOString()
          });
          return { success: true, priceChanged: true };
        } else {
          console.log(`   ✔️  Precio sin cambio: $${item.price}`);
          return { success: true, priceChanged: false };
        }
      } else {
          console.error(`   ⚠️  Error actualizando producto ${item.id}:`, updateError.message);
          return { success: false, reason: 'db_error' };
      }

    } else {
        // No se encontró el producto por EAN
        console.log(`   ⛔ Marcando como no disponible`);
        await supabase
            .from('supermarket_products')
            .update({ 
                is_available: false, 
                last_checked_at: new Date().toISOString() 
            })
            .eq('id', item.id);
        return { success: false, reason: 'not_found' };
    }
  };

  // D. Procesamiento paralelo optimizado con p-limit
  const CONCURRENCY_LIMIT = 30;
  const limit = pLimit(CONCURRENCY_LIMIT);
  console.log(`🚀 Ejecutando con concurrencia: ${CONCURRENCY_LIMIT} requests paralelos`);

  const promises = productsToUpdate.map((item, index) => {
    return limit(async () => {
       const result = await processProduct(item, index, productsToUpdate.length);
       if (result.success) {
         updatedCount++;
         if (result.priceChanged) priceChangedCount++;
       } else if (result.reason === 'not_found') {
         unavailableCount++;
       } else {
         errorCount++;
       }
       return result;
    });
  });

  await Promise.all(promises);

  // H. Estadísticas finales
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000; // en segundos
  const avgTimePerProduct = ((endTime - startTime) / productsToUpdate.length).toFixed(0); // en ms

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE EJECUCIÓN');
  console.log('='.repeat(60));
  console.log(`🕐 Hora de finalización: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`);
  console.log(`⏱️  Tiempo total: ${totalTime.toFixed(2)}s (${(totalTime / 60).toFixed(2)} minutos)`);
  console.log(`⚡ Tiempo promedio por producto: ${avgTimePerProduct}ms`);
  console.log(`\n📦 Productos procesados: ${productsToUpdate.length}`);
  console.log(`   ✅ Actualizados exitosamente: ${updatedCount} (${((updatedCount / productsToUpdate.length) * 100).toFixed(1)}%)`);
  console.log(`   💰 Con cambio de precio: ${priceChangedCount} (${((priceChangedCount / productsToUpdate.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ No disponibles/descontinuados: ${unavailableCount}`);
  if (errorCount > 0) {
    console.log(`   ⚠️  Errores al actualizar: ${errorCount}`);
  }
  console.log('='.repeat(60) + '\n');
}

// Ejecutar
runPriceUpdater();