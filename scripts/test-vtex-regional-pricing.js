/**
 * ============================================================================
 * 🧪 TEST: VTEX Regional Pricing - Precios por localidad/código postal
 * ============================================================================
 * 
 * Este script prueba si es posible obtener precios diferentes según la 
 * ubicación geográfica (código postal) en tiendas VTEX de Argentina.
 * 
 * ENFOQUE 1: Checkout Simulation API (POST /api/checkout/pub/orderForms/simulation)
 *   - Endpoint PÚBLICO (no requiere autenticación)
 *   - Recibe SKU IDs + código postal + país
 *   - Devuelve precios del seller más cercano a esa ubicación
 * 
 * ENFOQUE 2: Session API + GraphQL Search
 *   - Establece la ubicación en la sesión VTEX vía POST /api/sessions
 *   - Luego hace la búsqueda GraphQL normal (como ya hace el scraper)
 *   - Los precios deberían reflejar la regionalización
 * 
 * Se prueban con 10 EANs de productos comunes, comparando:
 *   - CABA (CP 1001) vs Mendoza (CP 5500)
 * 
 * Ejecutar: node scripts/test-vtex-regional-pricing.js
 * ============================================================================
 */

import 'dotenv/config';
import axios from 'axios';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SUPERMARKETS = {
  disco: {
    name: 'Disco',
    baseUrl: 'https://www.disco.com.ar',
    // El account name VTEX se extrae del dominio (ej: disco.com.ar -> disco suele ser "discoargentina" o similar)
    // Lo podemos inferir de _v/segment/graphql
  },
  jumbo: {
    name: 'Jumbo',
    baseUrl: 'https://www.jumbo.com.ar',
  },
  carrefour: {
    name: 'Carrefour',
    baseUrl: 'https://www.carrefour.com.ar',
  }
};

// Códigos postales de prueba
const POSTAL_CODES = {
  caba: { code: '1001', label: 'CABA (Capital Federal)' },
  mendoza: { code: '5500', label: 'Mendoza Capital' },
  cordoba: { code: '5000', label: 'Córdoba Capital' },
  rosario: { code: '2000', label: 'Rosario, Santa Fe' },
};

const COUNTRY = 'ARG';

// Hash VTEX para GraphQL (del .env)
const VTEX_SHA256_HASH = process.env.VTEX_SHA256_HASH;
if (!VTEX_SHA256_HASH) {
  console.error('❌ VTEX_SHA256_HASH no está configurado en .env');
  process.exit(1);
}

// ============================================================================
// UTILIDADES
// ============================================================================

function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function c(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// ENFOQUE 1: CHECKOUT SIMULATION API
// ============================================================================

/**
 * Simula un carrito con un SKU en una ubicación específica.
 * Endpoint público: POST {baseUrl}/api/checkout/pub/orderForms/simulation
 * 
 * @param {string} baseUrl - URL base del supermercado
 * @param {string} skuId - ID del SKU en VTEX
 * @param {string} postalCode - Código postal
 * @param {string} country - País (ej: 'ARG')
 * @param {string} sellerId - ID del seller (default: '1')
 * @returns {Object|null} - Datos del item simulado o null
 */
async function simulateCheckout(baseUrl, skuId, postalCode, country = 'ARG', sellerId = '1') {
  const url = `${baseUrl}/api/checkout/pub/orderForms/simulation`;

  const body = {
    items: [
      {
        id: String(skuId),
        quantity: 1,
        seller: sellerId,
      }
    ],
    postalCode: postalCode,
    country: country,
  };

  try {
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const data = response.data;

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return {
        skuId: item.id,
        name: item.name,
        price: item.price / 100, // VTEX devuelve en centavos
        listPrice: item.listPrice / 100,
        sellingPrice: item.sellingPrice / 100,
        seller: item.seller,
        sellerName: item.sellerChain?.[0] || item.seller,
        availability: item.availability,
        quantity: item.quantity,
        // Datos de logística/envío
        logisticsInfo: data.logisticsInfo?.[0] ? {
          deliveryChannels: data.logisticsInfo[0].deliveryChannels,
          slas: data.logisticsInfo[0].slas?.map(sla => ({
            name: sla.name,
            price: sla.price / 100,
            shippingEstimate: sla.shippingEstimate,
          })),
        } : null,
      };
    }

    return null;
  } catch (error) {
    if (error.response) {
      // En algunos casos VTEX devuelve el item pero con availability 'cannotBeDelivered'
      if (error.response.data?.items?.length > 0) {
        const item = error.response.data.items[0];
        return {
          skuId: item.id,
          name: item.name,
          price: item.price / 100,
          listPrice: item.listPrice / 100,
          sellingPrice: item.sellingPrice / 100,
          seller: item.seller,
          availability: item.availability || 'error',
        };
      }
    }
    return { error: error.message, status: error.response?.status };
  }
}

// ============================================================================
// ENFOQUE 2: SESSION API + GRAPHQL SEARCH
// ============================================================================

/**
 * Crea una sesión VTEX con una ubicación específica y luego busca un producto.
 * 
 * Paso 1: POST {baseUrl}/api/sessions - Establece la sesión con el CP
 * Paso 2: Usa las cookies de sesión para hacer la búsqueda GraphQL
 * 
 * @param {string} baseUrl - URL base
 * @param {string} searchTerm - EAN o nombre del producto
 * @param {string} postalCode - Código postal 
 * @param {string} country - País
 * @returns {Object|null}
 */
async function searchWithSession(baseUrl, searchTerm, postalCode, country = 'ARG') {
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  try {
    // PASO 1: Crear sesión con ubicación
    const sessionUrl = `${cleanBaseUrl}/api/sessions`;
    const sessionBody = {
      public: {
        postalCode: {
          value: postalCode,
        },
        country: {
          value: country,
        },
      }
    };

    const sessionResponse = await axios.post(sessionUrl, sessionBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
      // Importante: capturar cookies
      withCredentials: true,
    });

    // Extraer cookies de la respuesta
    const setCookies = sessionResponse.headers['set-cookie'] || [];
    const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');

    // También capturar vtex_segment y vtex_session del body si vienen
    const segmentToken = sessionResponse.data?.segmentToken;
    const sessionToken = sessionResponse.data?.sessionToken;

    // PASO 2: Buscar producto con las cookies de sesión
    const variables = {
      productOriginVtex: true,
      simulationBehavior: "default",
      hideUnavailableItems: true,
      fullText: searchTerm,
      count: 1,
      shippingOptions: [],
      variant: null,
    };

    // Agregar regionId a las variables si disponible
    if (sessionResponse.data?.namespaces?.store?.regionId?.value) {
      variables.regionId = sessionResponse.data.namespaces.store.regionId.value;
    }

    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: VTEX_SHA256_HASH,
        sender: "vtex.store-resources@0.x",
        provider: "vtex.search-graphql@0.x"
      },
      variables: encodeBase64(JSON.stringify(variables))
    };

    const params = new URLSearchParams({
      workspace: 'master',
      maxAge: 'short',
      appsEtag: 'remove',
      domain: 'store',
      locale: 'es-AR',
      operationName: 'productSuggestions',
      variables: '{}',
      extensions: JSON.stringify(extensions),
    });

    const graphqlUrl = `${cleanBaseUrl}/_v/segment/graphql/v1/?${params.toString()}`;

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    // Agregar cookies de sesión
    if (cookieString) {
      headers['Cookie'] = cookieString;
    }
    // Agregar tokens de segmento si los tenemos
    if (segmentToken) {
      headers['Cookie'] = (headers['Cookie'] || '') + `; vtex_segment=${segmentToken}`;
    }
    if (sessionToken) {
      headers['Cookie'] = (headers['Cookie'] || '') + `; vtex_session=${sessionToken}`;
    }

    const searchResponse = await axios.get(graphqlUrl, {
      headers,
      timeout: 15000,
    });

    const data = searchResponse.data;

    if (data?.data?.productSuggestions?.products?.length > 0) {
      const product = data.data.productSuggestions.products[0];
      const item = product.items?.[0];
      const seller = item?.sellers?.find(s => s.sellerDefault) || item?.sellers?.[0];

      return {
        name: product.productName,
        productId: product.productId,
        skuId: item?.itemId,
        ean: item?.ean,
        price: seller?.commertialOffer?.Price,
        listPrice: seller?.commertialOffer?.ListPrice,
        priceWithoutDiscount: seller?.commertialOffer?.PriceWithoutDiscount,
        sellerId: seller?.sellerId,
        sellerName: seller?.sellerName,
        availability: seller?.commertialOffer?.AvailableQuantity > 0,
        regionId: sessionResponse.data?.namespaces?.store?.regionId?.value || 'N/A',
        sessionInfo: {
          segmentToken: segmentToken ? '✓' : '✗',
          sessionToken: sessionToken ? '✓' : '✗',
          regionId: sessionResponse.data?.namespaces?.store?.regionId?.value || 'N/A',
        }
      };
    }

    return { noResults: true, regionId: sessionResponse.data?.namespaces?.store?.regionId?.value };
  } catch (error) {
    return { error: error.message, status: error.response?.status };
  }
}

// ============================================================================
// STEP 0: OBTENER SKU IDs REALES buscando productos 
// ============================================================================

/**
 * Busca productos por término y devuelve sus SKU IDs + EANs.
 * Los necesitamos porque el Checkout Simulation requiere SKU IDs, no EANs.
 */
async function getProductSkuIds(baseUrl, searchTerm, count = 5) {
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const variables = {
    productOriginVtex: true,
    simulationBehavior: "default",
    hideUnavailableItems: true,
    fullText: searchTerm,
    count: count,
    shippingOptions: [],
    variant: null,
  };

  const extensions = {
    persistedQuery: {
      version: 1,
      sha256Hash: VTEX_SHA256_HASH,
      sender: "vtex.store-resources@0.x",
      provider: "vtex.search-graphql@0.x"
    },
    variables: encodeBase64(JSON.stringify(variables))
  };

  const params = new URLSearchParams({
    workspace: 'master',
    maxAge: 'medium',
    appsEtag: 'remove',
    domain: 'store',
    locale: 'es-AR',
    operationName: 'productSuggestions',
    variables: '{}',
    extensions: JSON.stringify(extensions),
  });

  const url = `${cleanBaseUrl}/_v/segment/graphql/v1/?${params.toString()}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const products = response.data?.data?.productSuggestions?.products || [];

    return products.map(p => {
      const item = p.items?.[0];
      const seller = item?.sellers?.find(s => s.sellerDefault) || item?.sellers?.[0];
      return {
        name: p.productName,
        productId: p.productId,
        skuId: item?.itemId,
        ean: item?.ean,
        brand: p.brand,
        defaultPrice: seller?.commertialOffer?.Price,
        defaultSellerId: seller?.sellerId,
      };
    }).filter(p => p.ean && p.skuId);
  } catch (error) {
    console.error(`   Error buscando "${searchTerm}":`, error.message);
    return [];
  }
}

// ============================================================================
// TEST PRINCIPAL
// ============================================================================

async function runTest() {
  console.log('\n' + '═'.repeat(80));
  console.log(c('cyan', '  🧪 VTEX REGIONAL PRICING TEST'));
  console.log(c('cyan', '  Comparando precios por código postal en supermercados VTEX Argentina'));
  console.log('═'.repeat(80) + '\n');

  // Seleccionar supermercado para la prueba principal
  const supermarket = SUPERMARKETS.disco;
  console.log(c('bright', `📍 Supermercado de prueba: ${supermarket.name}`));
  console.log(c('bright', `   URL: ${supermarket.baseUrl}\n`));

  // ========================================================================
  // PASO 1: Obtener SKU IDs de productos reales
  // ========================================================================
  console.log(c('yellow', '━'.repeat(80)));
  console.log(c('yellow', '  PASO 1: Obteniendo SKU IDs de productos reales'));
  console.log(c('yellow', '━'.repeat(80)));

  const searchTerms = ['Coca Cola', 'Leche'];
  let testProducts = [];

  for (const term of searchTerms) {
    console.log(`\n🔍 Buscando: "${term}" en ${supermarket.name}...`);
    const products = await getProductSkuIds(supermarket.baseUrl, term, 5);
    
    if (products.length > 0) {
      console.log(`   ✅ ${products.length} productos encontrados`);
      testProducts.push(...products);
    } else {
      console.log(`   ❌ Sin resultados`);
    }
    await sleep(500);
  }

  // Tomar máximo 10 productos únicos
  testProducts = testProducts.slice(0, 10);

  if (testProducts.length === 0) {
    console.error('\n❌ No se pudieron obtener productos de prueba. Abortando.');
    process.exit(1);
  }

  console.log(`\n📦 ${c('bright', `${testProducts.length} productos`)} seleccionados para la prueba:\n`);
  testProducts.forEach((p, i) => {
    console.log(`   [${i + 1}] ${p.name}`);
    console.log(`       SKU: ${p.skuId} | EAN: ${p.ean} | Precio base: $${p.defaultPrice}`);
  });

  // ========================================================================
  // PASO 2: ENFOQUE 1 - Checkout Simulation API
  // ========================================================================
  console.log('\n' + c('yellow', '━'.repeat(80)));
  console.log(c('yellow', '  PASO 2: CHECKOUT SIMULATION API'));
  console.log(c('yellow', '  POST /api/checkout/pub/orderForms/simulation'));
  console.log(c('yellow', '  Comparando CABA vs Mendoza'));
  console.log(c('yellow', '━'.repeat(80)));

  const checkoutResults = [];
  const locations = [POSTAL_CODES.caba, POSTAL_CODES.mendoza];

  for (const product of testProducts) {
    const result = { product: product.name, ean: product.ean, skuId: product.skuId, prices: {} };

    for (const location of locations) {
      console.log(`\n🛒 Simulando: "${product.name}" (SKU: ${product.skuId}) → CP: ${location.code} (${location.label})`);

      const sim = await simulateCheckout(
        supermarket.baseUrl,
        product.skuId,
        location.code,
        COUNTRY,
        product.defaultSellerId || '1'
      );

      if (sim && !sim.error) {
        result.prices[location.code] = {
          label: location.label,
          price: sim.price,
          listPrice: sim.listPrice,
          sellingPrice: sim.sellingPrice,
          seller: sim.seller,
          sellerName: sim.sellerName,
          availability: sim.availability,
        };
        console.log(`   💰 Precio: $${sim.sellingPrice} | Seller: ${sim.seller} | Disponible: ${sim.availability}`);
      } else {
        result.prices[location.code] = { label: location.label, error: sim?.error || 'Sin respuesta', status: sim?.status };
        console.log(`   ❌ Error: ${sim?.error || 'Sin respuesta'} (Status: ${sim?.status || 'N/A'})`);
      }

      await sleep(300); // Rate limiting gentil
    }

    checkoutResults.push(result);
  }

  // ========================================================================
  // PASO 3: ENFOQUE 2 - Session API + GraphQL
  // ========================================================================
  console.log('\n' + c('yellow', '━'.repeat(80)));
  console.log(c('yellow', '  PASO 3: SESSION API + GRAPHQL SEARCH'));
  console.log(c('yellow', '  POST /api/sessions → GET /_v/segment/graphql/v1'));
  console.log(c('yellow', '  Comparando CABA vs Mendoza'));
  console.log(c('yellow', '━'.repeat(80)));

  const sessionResults = [];

  // Tomar solo 5 EANs para el Session Test (es más lento)
  const sessionTestProducts = testProducts.slice(0, 5);

  for (const product of sessionTestProducts) {
    const result = { product: product.name, ean: product.ean, prices: {} };

    for (const location of locations) {
      console.log(`\n🔄 Sesión + Búsqueda: "${product.ean}" → CP: ${location.code} (${location.label})`);

      const searchResult = await searchWithSession(
        supermarket.baseUrl,
        product.ean,
        location.code,
        COUNTRY
      );

      if (searchResult && !searchResult.error && !searchResult.noResults) {
        result.prices[location.code] = {
          label: location.label,
          price: searchResult.price,
          listPrice: searchResult.listPrice,
          sellerId: searchResult.sellerId,
          sellerName: searchResult.sellerName,
          availability: searchResult.availability,
          regionId: searchResult.regionId,
        };
        console.log(`   💰 Precio: $${searchResult.price} | Seller: ${searchResult.sellerName} | RegionID: ${searchResult.regionId}`);
      } else {
        result.prices[location.code] = {
          label: location.label,
          error: searchResult?.error || 'Sin resultados',
          regionId: searchResult?.regionId || 'N/A',
        };
        console.log(`   ❌ ${searchResult?.error || 'Sin resultados'} | RegionID: ${searchResult?.regionId || 'N/A'}`);
      }

      await sleep(500); // Más pausa para sesión
    }

    sessionResults.push(result);
  }

  // ========================================================================
  // PASO 4: También probar con otros supermercados (solo Checkout Simulation)
  // ========================================================================
  console.log('\n' + c('yellow', '━'.repeat(80)));
  console.log(c('yellow', '  PASO 4: CROSS-SUPERMARKET TEST'));
  console.log(c('yellow', '  Probando Checkout Simulation en Jumbo y Carrefour'));
  console.log(c('yellow', '━'.repeat(80)));

  const crossResults = {};

  for (const [key, sm] of Object.entries(SUPERMARKETS)) {
    if (key === 'disco') continue; // Ya lo testeamos

    crossResults[key] = [];
    console.log(`\n${c('bright', `📍 ${sm.name} (${sm.baseUrl})`)}`);

    // Obtener 3 productos de cada supermercado
    const smProducts = await getProductSkuIds(sm.baseUrl, 'Coca Cola', 3);

    if (smProducts.length === 0) {
      console.log(`   ❌ No se pudieron obtener productos de ${sm.name}`);
      continue;
    }

    for (const product of smProducts.slice(0, 2)) {
      const result = { product: product.name, skuId: product.skuId, prices: {} };

      for (const location of locations) {
        console.log(`   🛒 "${product.name}" (SKU: ${product.skuId}) → CP: ${location.code}`);
        const sim = await simulateCheckout(sm.baseUrl, product.skuId, location.code, COUNTRY, product.defaultSellerId || '1');

        if (sim && !sim.error) {
          result.prices[location.code] = {
            label: location.label,
            sellingPrice: sim.sellingPrice,
            availability: sim.availability,
            seller: sim.seller,
          };
          console.log(`      💰 $${sim.sellingPrice} | Disponible: ${sim.availability}`);
        } else {
          result.prices[location.code] = { error: sim?.error, status: sim?.status };
          console.log(`      ❌ ${sim?.error}`);
        }
        await sleep(300);
      }

      crossResults[key].push(result);
    }
  }

  // ========================================================================
  // RESUMEN FINAL
  // ========================================================================
  console.log('\n' + '═'.repeat(80));
  console.log(c('cyan', '  📊 RESUMEN DE RESULTADOS'));
  console.log('═'.repeat(80));

  // --- Checkout Simulation Results ---
  console.log(c('bright', '\n🛒 ENFOQUE 1: Checkout Simulation API'));
  console.log('─'.repeat(60));

  let pricesDiffer = 0;
  let pricesSame = 0;
  let pricesError = 0;

  for (const r of checkoutResults) {
    const cabaPrice = r.prices[POSTAL_CODES.caba.code];
    const mzaPrice = r.prices[POSTAL_CODES.mendoza.code];

    if (cabaPrice?.error || mzaPrice?.error) {
      pricesError++;
      console.log(`  ❓ ${r.product} — ${c('red', 'Error en una o ambas consultas')}`);
      continue;
    }

    const diff = cabaPrice.sellingPrice !== mzaPrice.sellingPrice;
    if (diff) pricesDiffer++;
    else pricesSame++;

    const icon = diff ? '🔴' : '🟢';
    const diffText = diff
      ? c('red', `DIFIEREN — CABA: $${cabaPrice.sellingPrice} vs MZA: $${mzaPrice.sellingPrice}`)
      : c('green', `IGUALES — $${cabaPrice.sellingPrice}`);

    console.log(`  ${icon} ${r.product}`);
    console.log(`     EAN: ${r.ean} | ${diffText}`);
  }

  console.log(`\n  ${c('bright', 'Totales:')} ` +
    `${c('red', `${pricesDiffer} difieren`)} | ` +
    `${c('green', `${pricesSame} iguales`)} | ` +
    `${c('yellow', `${pricesError} errores`)}`);

  // --- Session API Results ---
  console.log(c('bright', '\n🔄 ENFOQUE 2: Session API + GraphQL'));
  console.log('─'.repeat(60));

  let sessionDiffer = 0;
  let sessionSame = 0;
  let sessionError = 0;

  for (const r of sessionResults) {
    const cabaPrice = r.prices[POSTAL_CODES.caba.code];
    const mzaPrice = r.prices[POSTAL_CODES.mendoza.code];

    if (cabaPrice?.error || mzaPrice?.error) {
      sessionError++;
      console.log(`  ❓ ${r.product} — ${c('red', cabaPrice?.error || mzaPrice?.error)}`);
      continue;
    }

    const diff = cabaPrice.price !== mzaPrice.price;
    if (diff) sessionDiffer++;
    else sessionSame++;

    const icon = diff ? '🔴' : '🟢';
    const diffText = diff
      ? c('red', `DIFIEREN — CABA: $${cabaPrice.price} vs MZA: $${mzaPrice.price}`)
      : c('green', `IGUALES — $${cabaPrice.price}`);

    console.log(`  ${icon} ${r.product}`);
    console.log(`     EAN: ${r.ean} | ${diffText}`);
    console.log(`     RegionIDs: CABA=${cabaPrice.regionId} | MZA=${mzaPrice.regionId}`);
  }

  console.log(`\n  ${c('bright', 'Totales:')} ` +
    `${c('red', `${sessionDiffer} difieren`)} | ` +
    `${c('green', `${sessionSame} iguales`)} | ` +
    `${c('yellow', `${sessionError} errores`)}`);

  // --- Cross-supermarket ---
  console.log(c('bright', '\n🏪 CROSS-SUPERMARKET (Checkout Simulation)'));
  console.log('─'.repeat(60));

  for (const [key, results] of Object.entries(crossResults)) {
    console.log(`\n  📍 ${SUPERMARKETS[key].name}:`);
    for (const r of results) {
      const cabaPrice = r.prices[POSTAL_CODES.caba.code];
      const mzaPrice = r.prices[POSTAL_CODES.mendoza.code];

      if (cabaPrice?.error || mzaPrice?.error) {
        console.log(`    ❓ ${r.product} — Error`);
        continue;
      }

      const diff = cabaPrice.sellingPrice !== mzaPrice.sellingPrice;
      const icon = diff ? '🔴' : '🟢';
      const text = diff
        ? `CABA: $${cabaPrice.sellingPrice} vs MZA: $${mzaPrice.sellingPrice}`
        : `$${cabaPrice.sellingPrice} (iguales)`;

      console.log(`    ${icon} ${r.product} — ${text}`);
    }
  }

  // ========================================================================
  // CONCLUSIÓN
  // ========================================================================
  console.log('\n' + '═'.repeat(80));
  console.log(c('cyan', '  📋 ANÁLISIS Y CONCLUSIÓN'));
  console.log('═'.repeat(80));

  const totalChecked = pricesDiffer + pricesSame;
  const hasRegionalPricing = pricesDiffer > 0 || sessionDiffer > 0;

  if (hasRegionalPricing) {
    console.log(c('green', `
  ✅ SE DETECTARON DIFERENCIAS DE PRECIO POR REGIÓN
  
  Los supermercados VTEX SÍ tienen precios regionalizados.
  Esto significa que se puede implementar la obtención de precios
  por código postal en el scraper.
  
  Enfoque recomendado: Checkout Simulation API
  - No requiere autenticación  
  - Endpoint público y estable
  - Permite consultar por SKU ID + código postal
  - Se puede integrar tras el scraping inicial para enriquecer datos
    `));
  } else {
    console.log(c('yellow', `
  ⚠️  NO SE DETECTARON DIFERENCIAS DE PRECIO POR REGIÓN
  
  Los precios fueron iguales entre CABA y Mendoza para todos los productos testeados.
  
  Posibles razones:
  1. Estos supermercados NO tienen precios regionalizados (precio único nacional)
  2. La diferencia solo aplica a ciertos códigos postales específicos
  3. La regionalización solo afecta disponibilidad, no precio
  4. Se necesita un seller ID diferente por región (White Label Sellers)
  
  Sugerencias para investigar más:
  - Probar con más códigos postales (ej: ciudades del norte/sur)
  - Probar con el endpoint de regiones: GET /api/checkout/pub/regions/{postalCode}
  - Verificar si hay sellers diferentes por zona
    `));
  }

  console.log(`  Checkout Simulation: ${totalChecked > 0 ? `${pricesDiffer}/${totalChecked} con precios diferentes` : 'Sin datos'}`);
  console.log(`  Session + GraphQL: ${(sessionDiffer + sessionSame) > 0 ? `${sessionDiffer}/${sessionDiffer + sessionSame} con precios diferentes` : 'Sin datos'}`);
  console.log(`  Errores totales: ${pricesError + sessionError}\n`);
}

// ============================================================================
// EJECUTAR
// ============================================================================

runTest().catch(error => {
  console.error('\n💥 Error fatal:', error);
  process.exit(1);
});
