/**
 * ============================================================================
 * 🧪 TEST v3: VTEX Sales Channels Brute Force + Direct Domain
 * ============================================================================
 * 
 * Prueba directamente en los dominios de las tiendas el Catalog System API
 * con diferentes sc (sales channel) para ver si cambian precios.
 * 
 * También prueba: vtex_segment cookie y diferentes trade policies.
 * 
 * Ejecutar: node scripts/test-vtex-sales-channels.js
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

const TEST_EANS = [
  '7790895067570', // Coca-Cola Zero 2.25L
  '7790895000997', // Coca-Cola Original 2.25L
  '7790310985540', // Leche La Serenísima
  '7790250054443', // Yerba Taragüi
  '7790080012903', // Galletitas Pepitos
];

const VTEX_STORES = {
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

async function main() {
  console.log('═'.repeat(80));
  console.log('  🧪 VTEX SALES CHANNELS + CATALOG API TEST v3');
  console.log('═'.repeat(80));

  const ean = TEST_EANS[0]; // Coca-Cola Zero

  // ===== PASO 1: Brute force sales channels en cada tienda =====
  console.log('\n━━━ PASO 1: Probando Sales Channels 1-10 en cada tienda ━━━\n');

  for (const [key, store] of Object.entries(VTEX_STORES)) {
    console.log(`\n📍 ${store.name}`);
    
    // Intentar ambos dominios
    const urls = [store.backendUrl, store.directUrl];
    let workingUrl = null;
    
    for (const baseUrl of urls) {
      try {
        const testUrl = `${baseUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
        const r = await ax.get(testUrl);
        if (r.data?.length > 0) {
          workingUrl = baseUrl;
          console.log(`   ✅ URL activa: ${baseUrl}`);
          break;
        }
      } catch (e) { /* skip */ }
    }
    
    if (!workingUrl) {
      console.log(`   ❌ Ninguna URL funciona para ${store.name}`);
      continue;
    }

    // Probar sc=1 a sc=10
    const results = [];
    for (let sc = 1; sc <= 10; sc++) {
      try {
        const url = `${workingUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}&sc=${sc}`;
        const r = await ax.get(url);
        
        if (r.data?.length > 0) {
          const p = r.data[0];
          const sku = p.items?.[0];
          const sellers = sku?.sellers || [];
          const mainSeller = sellers[0];
          
          results.push({
            sc,
            price: mainSeller?.commertialOffer?.Price,
            listPrice: mainSeller?.commertialOffer?.ListPrice,
            seller: mainSeller?.sellerName,
            sellerId: mainSeller?.sellerId,
            sellerCount: sellers.length,
            available: mainSeller?.commertialOffer?.AvailableQuantity > 0,
          });
          
          console.log(`   sc=${sc}: $${mainSeller?.commertialOffer?.Price} | list: $${mainSeller?.commertialOffer?.ListPrice} | ${mainSeller?.sellerName} | sellers: ${sellers.length} | avail: ${mainSeller?.commertialOffer?.AvailableQuantity > 0}`);
        } else {
          console.log(`   sc=${sc}: Sin resultados`);
        }
      } catch (e) {
        console.log(`   sc=${sc}: Error ${e.response?.status || e.message}`);
      }
      await sleep(200);
    }

    // Analizar si hay diferencias
    const prices = results.map(r => r.price).filter(p => p !== undefined);
    const uniquePrices = [...new Set(prices)];
    if (uniquePrices.length > 1) {
      console.log(`   🔴 HAY DIFERENCIAS DE PRECIO: ${uniquePrices.join(', ')}`);
    } else if (uniquePrices.length === 1) {
      console.log(`   🟢 Todos iguales: $${uniquePrices[0]}`);
    }
  }

  // ===== PASO 2: Probar el Catalog API con headers de segmento =====
  console.log('\n━━━ PASO 2: Probando con diferentes segments/regiones ━━━\n');

  for (const [key, store] of Object.entries(VTEX_STORES)) {
    console.log(`\n📍 ${store.name}`);
    
    // Paso 2a: Crear sesión con CP de Mendoza vs CABA
    const postalCodes = [
      { code: '1001', label: 'CABA' },
      { code: '5500', label: 'Mendoza' },
      { code: '8000', label: 'Bahía Blanca' },
    ];

    for (const loc of postalCodes) {
      try {
        // Crear sesión
        const sessionResp = await ax.post(`${store.directUrl}/api/sessions`, {
          public: {
            postalCode: { value: loc.code },
            country: { value: 'ARG' },
          }
        });
        
        const segmentToken = sessionResp.data?.segmentToken;
        const sessionToken = sessionResp.data?.sessionToken;
        
        // Decode segment para ver regionId y channel
        let segmentData = {};
        if (segmentToken) {
          try {
            // El token es un JWT base64, las partes están separadas por .
            const parts = segmentToken.split('.');
            if (parts.length >= 2) {
              segmentData = JSON.parse(Buffer.from(parts[0], 'base64').toString());
            }
          } catch (e) {
            // El segment token podría ser base64 simple
            try {
              segmentData = JSON.parse(Buffer.from(segmentToken, 'base64').toString());
            } catch (e2) { /* skip */ }
          }
        }

        // Buscar producto con ese segment
        const cookies = [];
        if (segmentToken) cookies.push(`vtex_segment=${segmentToken}`);
        if (sessionToken) cookies.push(`vtex_session=${sessionToken}`);
        
        const searchUrl = `${store.directUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
        const searchResp = await ax.get(searchUrl, {
          headers: cookies.length > 0 ? { Cookie: cookies.join('; ') } : {},
        });
        
        if (searchResp.data?.length > 0) {
          const p = searchResp.data[0];
          const sku = p.items?.[0];
          const seller = sku?.sellers?.[0];
          console.log(`   CP=${loc.code} (${loc.label}): $${seller?.commertialOffer?.Price} | seller: ${seller?.sellerName} | regionId: ${segmentData?.regionId || 'null'} | channel: ${segmentData?.channel || 'N/A'}`);
        } else {
          console.log(`   CP=${loc.code} (${loc.label}): Sin resultados`);
        }
      } catch (e) {
        console.log(`   CP=${loc.code} (${loc.label}): Error ${e.response?.status || e.message}`);
      }
      await sleep(500);
    }
  }

  // ===== PASO 3: Probar con TODOS los EANs en sc's que dieron resultado =====
  console.log('\n━━━ PASO 3: Comparación multi-EAN entre canales que funcionan ━━━\n');

  // Vamos a probar Disco con sc=1 vs sc sin especificar (default)
  const discoUrl = VTEX_STORES.disco.backendUrl;
  
  console.log(`📍 Disco — SC Default vs SC 1 vs SC 2`);
  for (const ean of TEST_EANS) {
    const prices = {};
    
    for (const sc of [null, 1, 2, 3]) {
      try {
        let url = `${discoUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
        if (sc) url += `&sc=${sc}`;
        
        const r = await ax.get(url);
        if (r.data?.length > 0) {
          const seller = r.data[0].items?.[0]?.sellers?.[0];
          prices[sc || 'default'] = {
            price: seller?.commertialOffer?.Price,
            name: r.data[0].productName,
          };
        }
      } catch (e) { /* skip */ }
      await sleep(150);
    }

    const priceValues = Object.entries(prices);
    if (priceValues.length > 0) {
      const allSame = priceValues.every(([, p]) => p.price === priceValues[0][1].price);
      const icon = allSame ? '🟢' : '🔴';
      const name = priceValues[0][1].name;
      const priceStr = priceValues.map(([sc, p]) => `sc=${sc}: $${p.price}`).join(' | ');
      console.log(`   ${icon} ${name}: ${priceStr}`);
    } else {
      console.log(`   ❌ EAN ${ean}: No encontrado`);
    }
  }

  // ===== PASO 4: Intentar obtener la lista de sellers del store =====
  console.log('\n━━━ PASO 4: Investigando sellers de cada tienda ━━━\n');

  for (const [key, store] of Object.entries(VTEX_STORES)) {
    console.log(`📍 ${store.name}`);
    
    // Ver si un producto tiene múltiples sellers
    try {
      const url = `${store.backendUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
      const r = await ax.get(url);
      
      if (r.data?.length > 0) {
        const sku = r.data[0].items?.[0];
        const sellers = sku?.sellers || [];
        console.log(`   Sellers para ${r.data[0].productName}:`);
        sellers.forEach((s, i) => {
          const offer = s.commertialOffer;
          console.log(`   [${i}] ${s.sellerName} (id=${s.sellerId}): $${offer?.Price} | stock: ${offer?.AvailableQuantity} | offers: ${offer?.Installments?.length || 0} installments`);
        });
        
        if (sellers.length <= 1) {
          console.log(`   ⚠️ Solo 1 seller — No hay regionalización por sellers múltiples`);
        }
      }
    } catch (e) {
      console.log(`   Error: ${e.response?.status || e.message}`);
    }
    await sleep(300);
  }

  // ===== PASO 5: Verificar trade policies via Checkout =====
  console.log('\n━━━ PASO 5: Checkout Simulation con sc param ━━━\n');
  
  for (const [key, store] of Object.entries(VTEX_STORES)) {
    console.log(`📍 ${store.name}`);
    
    // Obtener un SKU ID
    let skuId = null;
    try {
      const url = `${store.backendUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
      const r = await ax.get(url);
      if (r.data?.length > 0) {
        skuId = r.data[0].items?.[0]?.itemId;
      }
    } catch (e) { /* skip */ }
    
    if (!skuId) {
      console.log(`   ❌ No se pudo obtener SKU ID`);
      continue;
    }
    
    // Probar checkout sim con diferentes sc + CP
    for (const cp of ['1001', '5500']) {
      for (const sc of [null, 1, 2, 33]) {
        try {
          let url = `${store.directUrl}/api/checkout/pub/orderForms/simulation`;
          if (sc) url += `?sc=${sc}`;
          
          const body = {
            items: [{ id: String(skuId), quantity: 1, seller: '1' }],
            postalCode: cp,
            country: 'ARG',
          };
          
          const r = await ax.post(url, body);
          if (r.data?.items?.[0]) {
            const item = r.data.items[0];
            console.log(`   CP=${cp} sc=${sc || 'default'}: $${item.sellingPrice/100} (avail: ${item.availability})`);
          }
        } catch (e) {
          if (e.response?.data?.items?.[0]) {
            const item = e.response.data.items[0];
            console.log(`   CP=${cp} sc=${sc || 'default'}: $${item.sellingPrice/100} (avail: ${item.availability || 'error'})`);
          } else {
            console.log(`   CP=${cp} sc=${sc || 'default'}: Error ${e.response?.status || e.message}`);
          }
        }
        await sleep(200);
      }
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('  ✅ TEST v3 COMPLETO');
  console.log('═'.repeat(80) + '\n');
}

main().catch(e => {
  console.error('💥 Fatal:', e.message);
  process.exit(1);
});
