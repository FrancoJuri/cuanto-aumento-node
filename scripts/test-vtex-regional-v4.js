/**
 * ============================================================================
 * 🧪 TEST v4: FOCUSED - Session API + Catalog System = Regional Prices
 * ============================================================================
 * 
 * Enfoque CONFIRMADO: la combinación Session API + Catalog System API
 * SÍ devuelve precios diferentes por código postal.
 * 
 * Flujo:
 * 1. POST {baseUrl}/api/sessions → con postalCode y country
 * 2. Capturar cookies vtex_segment y vtex_session
 * 3. GET {backend}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:{EAN}
 *    → Enviar las cookies de sesión
 * 
 * Compara 10 EANs en 4 ubicaciones x 3 supermercados.
 * 
 * Ejecutar: node scripts/test-vtex-regional-v4.js
 * ============================================================================
 */

import 'dotenv/config';
import axios from 'axios';

const ax = axios.create({
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// CONFIG
// ============================================================================

const STORES = {
  disco: {
    name: 'Disco',
    directUrl: 'https://www.disco.com.ar',
    backendUrl: 'https://discoargentina.vtexcommercestable.com.br',
  },
  jumbo: {
    name: 'Jumbo',
    directUrl: 'https://www.jumbo.com.ar',
    backendUrl: 'https://jumboargonline.vtexcommercestable.com.br',
  },
  carrefour: {
    name: 'Carrefour',
    directUrl: 'https://www.carrefour.com.ar',
    backendUrl: 'https://carrefourar.vtexcommercestable.com.br',
  },
};

const LOCATIONS = [
  { code: '1001', label: 'CABA' },
  { code: '5500', label: 'Mendoza' },
  { code: '5000', label: 'Córdoba' },
  { code: '2000', label: 'Rosario' },
  { code: '8000', label: 'Bahía Blanca' },
  { code: '4000', label: 'Tucumán' },
];

const TEST_EANS = [
  '7790895067570', // Coca-Cola Zero 2.25L
  '7790895000997', // Coca-Cola Original 2.25L
  '7790895012259', // Coca Cola Zero 1.75L
  '7790310985540', // Leche La Serenísima
  '7790742036001', // Fideos Matarazzo
  '7790580529109', // Arroz Gallo Oro
  '7791249002087', // Mayonesa Hellmanns
  '7790895005312', // Coca-Cola Sabor Liviano
  '7790895000232', // Coca-Cola 354ml
  '7790250054443', // Yerba Taragüi
];

// ============================================================================
// CORE: Session + Catalog Search
// ============================================================================

/**
 * Crea una sesión VTEX con ubicación y busca un producto por EAN.
 */
async function getRegionalPrice(store, ean, postalCode) {
  try {
    // Paso 1: Crear sesión con ubicación
    const sessionResp = await ax.post(`${store.directUrl}/api/sessions`, {
      public: {
        postalCode: { value: postalCode },
        country: { value: 'ARG' },
      }
    });
    
    const segmentToken = sessionResp.data?.segmentToken;
    const sessionToken = sessionResp.data?.sessionToken;
    
    // Construir cookies
    const cookies = [];
    if (segmentToken) cookies.push(`vtex_segment=${segmentToken}`);
    if (sessionToken) cookies.push(`vtex_session=${sessionToken}`);
    
    // Paso 2: Buscar producto con cookies de sesión
    // Probar primero con backend, luego con dominio directo
    const urls = [
      `${store.backendUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
      `${store.directUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
    ];
    
    for (const url of urls) {
      try {
        const headers = {};
        if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');
        
        const searchResp = await ax.get(url, { headers });
        
        if (searchResp.data?.length > 0) {
          const product = searchResp.data[0];
          const sku = product.items?.[0];
          const seller = sku?.sellers?.find(s => s.sellerDefault) || sku?.sellers?.[0];
          const offer = seller?.commertialOffer;
          
          return {
            found: true,
            name: product.productName,
            price: offer?.Price,
            listPrice: offer?.ListPrice,
            priceWithoutDiscount: offer?.PriceWithoutDiscount,
            sellerName: seller?.sellerName,
            sellerId: seller?.sellerId,
            available: offer?.AvailableQuantity > 0,
            stock: offer?.AvailableQuantity,
          };
        }
      } catch (e) {
        // Probar siguiente URL
      }
    }
    
    return { found: false };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Buscar producto SIN sesión (sin cookies, precio "base")
 */
async function getBasePrice(store, ean) {
  const urls = [
    `${store.backendUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
    `${store.directUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`,
  ];
  
  for (const url of urls) {
    try {
      const r = await ax.get(url);
      if (r.data?.length > 0) {
        const product = r.data[0];
        const sku = product.items?.[0];
        const seller = sku?.sellers?.find(s => s.sellerDefault) || sku?.sellers?.[0];
        return {
          found: true,
          name: product.productName,
          price: seller?.commertialOffer?.Price,
          listPrice: seller?.commertialOffer?.ListPrice,
          sellerName: seller?.sellerName,
        };
      }
    } catch (e) { /* next */ }
  }
  return { found: false };
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('  🧪 VTEX REGIONAL PRICING — TEST FOCUSED v4');
  console.log('  Session API + Catalog System API');
  console.log('═'.repeat(80));

  const allResults = {};

  for (const [storeKey, store] of Object.entries(STORES)) {
    console.log(`\n${'━'.repeat(80)}`);
    console.log(`  📍 ${store.name.toUpperCase()}`);
    console.log('━'.repeat(80));

    allResults[storeKey] = {};

    for (const ean of TEST_EANS) {
      // Primero obtener el precio base (sin sesión)
      const baseResult = await getBasePrice(store, ean);
      
      if (!baseResult.found) {
        console.log(`\n  ❌ EAN ${ean}: No encontrado en ${store.name}`);
        continue;
      }

      console.log(`\n  📦 ${baseResult.name} (EAN: ${ean})`);
      console.log(`     Precio base (sin sesión): $${baseResult.price}`);

      const locationPrices = {};
      let hasDifference = false;

      for (const loc of LOCATIONS) {
        const result = await getRegionalPrice(store, ean, loc.code);

        if (result.found) {
          locationPrices[loc.code] = result;
          
          if (result.price !== baseResult.price) {
            hasDifference = true;
          }
          
          const icon = result.price !== baseResult.price ? '🔴' : '🟢';
          const diff = result.price !== baseResult.price 
            ? ` (${result.price > baseResult.price ? '+' : ''}${((result.price - baseResult.price) / baseResult.price * 100).toFixed(1)}%)`
            : '';
          
          console.log(`     ${icon} CP ${loc.code} (${loc.label}): $${result.price}${diff} | stock: ${result.stock} | seller: ${result.sellerName}`);
        } else if (result.error) {
          console.log(`     ❓ CP ${loc.code} (${loc.label}): Error — ${result.error}`);
        } else {
          console.log(`     ⚪ CP ${loc.code} (${loc.label}): No disponible`);
        }
        
        await sleep(300); // Rate limiting
      }

      if (hasDifference) {
        console.log(`     🔴🔴 ¡¡PRECIOS DIFERENTES DETECTADOS!! 🔴🔴`);
      }

      allResults[storeKey][ean] = { base: baseResult, locations: locationPrices, hasDifference };
      await sleep(200);
    }
  }

  // ========================================================================
  // RESUMEN FINAL
  // ========================================================================
  console.log('\n' + '═'.repeat(80));
  console.log('  📊 RESUMEN FINAL');
  console.log('═'.repeat(80));

  for (const [storeKey, products] of Object.entries(allResults)) {
    const store = STORES[storeKey];
    const productEntries = Object.entries(products);
    const withDiff = productEntries.filter(([, p]) => p.hasDifference);
    const withoutDiff = productEntries.filter(([, p]) => !p.hasDifference && p.base?.found);

    console.log(`\n📍 ${store.name}:`);
    console.log(`   Total productos testeados: ${productEntries.length}`);
    console.log(`   Con diferencias de precio: ${withDiff.length}`);
    console.log(`   Sin diferencias: ${withoutDiff.length}`);

    if (withDiff.length > 0) {
      console.log(`\n   🔴 Productos con precios regionalizados:`);
      for (const [ean, data] of withDiff) {
        const prices = Object.entries(data.locations)
          .map(([cp, r]) => `CP ${cp}: $${r.price}`)
          .join(' | ');
        console.log(`      • ${data.base.name}: base=$${data.base.price} → ${prices}`);
      }
    }
  }

  // ¿Hubo diferencias en alguna tienda?
  const anyDifferences = Object.values(allResults).some(products =>
    Object.values(products).some(p => p.hasDifference)
  );

  console.log('\n' + '═'.repeat(80));
  if (anyDifferences) {
    console.log('  ✅ SE CONFIRMARON DIFERENCIAS DE PRECIO POR REGIÓN');
    console.log('  El enfoque Session API + Catalog System API funciona.');
  } else {
    console.log('  ⚠️  No se detectaron diferencias de precio por región');
    console.log('  Los precios fueron iguales en todas las ubicaciones testeadas.');
  }
  console.log('═'.repeat(80) + '\n');
}

main().catch(e => {
  console.error('💥 Fatal:', e.message);
  process.exit(1);
});
