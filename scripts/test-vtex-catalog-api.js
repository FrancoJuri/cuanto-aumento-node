/**
 * ============================================================================
 * 🧪 TEST v2: VTEX Catalog System API + Sales Channels
 * ============================================================================
 * 
 * Enfoque alternativo: usar el Catalog System API con el parámetro `sc`
 * (sales channel / trade policy) para obtener precios regionalizados.
 * 
 * URL: https://{account}.vtexcommercestable.com.br/api/catalog_system/pub/products/search
 * 
 * Ejecutar: node scripts/test-vtex-catalog-api.js
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

// 10 EANs de productos comunes
const TEST_EANS = [
  '7790895067570', // Coca-Cola Zero 2.25L
  '7790895000997', // Coca-Cola Original 2.25L
  '7790895012259', // Coca Cola Zero 1.75L
  '7790310985540', // Leche La Serenísima
  '77916020',      // Aceite Cocinero
  '7790250054443', // Yerba Taragüi
  '7790080012903', // Galletitas Pepitos
  '7790742036001', // Fideos Matarazzo
  '7790580529109', // Arroz Gallo Oro
  '7791249002087', // Mayonesa Hellmanns
];

// ============================================================================
// PASO 1: Descubrir el account name VTEX de cada supermercado
// ============================================================================

async function discoverVtexAccount(storeUrl) {
  try {
    // Método 1: Hacer un request al store y ver los headers/redirects
    const r = await ax.get(storeUrl + '/_v/segment/graphql/v1/', {
      maxRedirects: 0,
      validateStatus: () => true,
    });
    
    // Buscar en headers
    const serverHeader = r.headers['x-vtex-account'] || '';
    if (serverHeader) return serverHeader;

    // Método 2: Intentar parsear cookies de respuesta
    const cookies = r.headers['set-cookie'] || [];
    for (const cookie of cookies) {
      const match = cookie.match(/vtex_session.*?domain=\.?([^.]+)\.vtexcommercestable/i);
      if (match) return match[1];
    }
  } catch (e) {}

  // Método 3: Probar dominios comunes
  return null;
}

// ============================================================================
// PASO 2: Catalog System API - Buscar producto por EAN
// ============================================================================

async function searchByEan(accountOrUrl, ean, salesChannel = null) {
  // Probar tanto el dominio vtexcommercestable como el dominio directo
  const urls = [];
  
  if (accountOrUrl.startsWith('http')) {
    // Es una URL directa
    urls.push(`${accountOrUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}${salesChannel ? '&sc=' + salesChannel : ''}`);
  } else {
    // Es un account name
    urls.push(`https://${accountOrUrl}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}${salesChannel ? '&sc=' + salesChannel : ''}`);
  }

  for (const url of urls) {
    try {
      const r = await ax.get(url);
      if (r.data && r.data.length > 0) {
        return { data: r.data, url };
      }
    } catch (e) {
      // Intentar próxima URL
    }
  }
  return null;
}

// ============================================================================
// PASO 3: Probar muchas variantes de account names
// ============================================================================

async function findWorkingAccount(storeName, ean) {
  const accounts = {
    'Disco': [
      'discoargentina', 'disco', 'discoar', 'caborjonline',
      'discoenvio', 'discocom', 'discocomarg'
    ],
    'Jumbo': [
      'jumboargonline', 'jumboargentina', 'jumbo', 'jumboar',
      'jumboonline', 'jumbocom', 'jumbocomarg'
    ],
    'Carrefour': [
      'carrefourar', 'carrefourarg', 'carrefourargentina', 'carrefour',
      'caraborconline', 'carrefourbr'
    ],
    'Vea': [
      'veaargentina', 'vea', 'veaar', 'veacom'
    ],
  };

  const storeAccounts = accounts[storeName] || [];
  
  for (const account of storeAccounts) {
    try {
      const url = `https://${account}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
      const r = await ax.get(url);
      if (r.data && r.data.length > 0) {
        return { account, data: r.data };
      }
    } catch (e) {
      // 404 = account exists but no product, other = wrong account
      if (e.response?.status === 404 || e.response?.status === 200) {
        // Account exists, just no product
        return { account, data: [] };
      }
    }
  }
  
  // Método alternativo: usar el dominio directo de la tienda
  for (const domain of getDirectDomains(storeName)) {
    try {
      const url = `https://${domain}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
      const r = await ax.get(url);
      if (r.data && r.data.length > 0) {
        return { account: domain, data: r.data, isDirect: true };
      }
    } catch (e) {
      if (e.response?.status === 200) {
        return { account: domain, data: [], isDirect: true };
      }
    }
  }
  
  return null;
}

function getDirectDomains(storeName) {
  switch (storeName) {
    case 'Disco': return ['www.disco.com.ar'];
    case 'Jumbo': return ['www.jumbo.com.ar'];
    case 'Carrefour': return ['www.carrefour.com.ar'];
    case 'Vea': return ['www.vea.com.ar'];
    default: return [];
  }
}

// ============================================================================
// PASO 4: Listar sales channels disponibles
// ============================================================================

async function getSalesChannels(accountOrDomain) {
  const urls = [
    `https://${accountOrDomain}/api/catalog_system/pub/saleschannel/list`,
    `https://${accountOrDomain}.vtexcommercestable.com.br/api/catalog_system/pub/saleschannel/list`,
  ];
  
  for (const url of urls) {
    try {
      const r = await ax.get(url);
      if (r.data) return r.data;
    } catch (e) {
      // Probar siguiente
    }
  }
  return null;
}

// ============================================================================
// PASO 5: Checkout Simulation con el Catalog API approach
// ============================================================================

async function checkoutSimulationWithSc(baseUrl, skuId, postalCode, salesChannel = null) {
  const url = `${baseUrl}/api/checkout/pub/orderForms/simulation`;
  const body = {
    items: [{ id: String(skuId), quantity: 1, seller: '1' }],
    postalCode,
    country: 'ARG',
  };

  if (salesChannel) {
    body.salesChannel = salesChannel;
  }

  try {
    const r = await ax.post(url, body);
    if (r.data?.items?.[0]) {
      const item = r.data.items[0];
      return {
        price: item.price / 100,
        listPrice: item.listPrice / 100,
        sellingPrice: item.sellingPrice / 100,
        availability: item.availability,
        seller: item.seller,
      };
    }
  } catch (e) {
    if (e.response?.data?.items?.[0]) {
      const item = e.response.data.items[0];
      return {
        price: item.price / 100,
        listPrice: item.listPrice / 100,
        sellingPrice: item.sellingPrice / 100,
        availability: item.availability || 'error',
        seller: item.seller,
      };
    }
    return { error: e.response?.status || e.message };
  }
  return null;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('  🧪 VTEX CATALOG SYSTEM API + SALES CHANNELS TEST');
  console.log('═'.repeat(80));

  const stores = ['Disco', 'Jumbo', 'Carrefour'];
  const testEan = TEST_EANS[0]; // Coca-Cola Zero

  // ===== PASO 1: Descubrir accounts =====
  console.log('\n━━━ PASO 1: Descubriendo accounts VTEX ━━━\n');
  
  const foundAccounts = {};
  
  for (const store of stores) {
    console.log(`🔍 Buscando account de ${store}...`);
    const result = await findWorkingAccount(store, testEan);
    
    if (result) {
      foundAccounts[store] = result;
      console.log(`   ✅ Account: ${result.account} (${result.isDirect ? 'dominio directo' : 'vtexcommercestable'})`);
      if (result.data.length > 0) {
        console.log(`   📦 Producto encontrado: ${result.data[0].productName}`);
        const sku = result.data[0].items?.[0];
        console.log(`   🔢 SKU ID: ${sku?.itemId}, EAN: ${sku?.ean}`);
        const sellers = sku?.sellers || [];
        console.log(`   👥 Sellers (${sellers.length}):`);
        sellers.forEach((s, i) => {
          console.log(`      [${i}] ${s.sellerName} (id: ${s.sellerId}) → $${s.commertialOffer?.Price}`);
        });
      }
    } else {
      console.log(`   ❌ No se encontró account para ${store}`);
    }
    await sleep(500);
  }

  // ===== PASO 2: Listar Sales Channels =====
  console.log('\n━━━ PASO 2: Listando Sales Channels ━━━\n');
  
  const channelsMap = {};
  
  for (const [store, info] of Object.entries(foundAccounts)) {
    console.log(`📋 Sales channels de ${store} (${info.account}):`);
    const channels = await getSalesChannels(info.account);
    
    if (channels) {
      channelsMap[store] = channels;
      channels.forEach(ch => {
        console.log(`   [sc=${ch.Id}] "${ch.Name}" — Active: ${ch.IsActive} | CountryCode: ${ch.CountryCode || 'N/A'}`);
      });
    } else {
      console.log(`   ❌ No se pudieron obtener sales channels`);
    }
    await sleep(500);
  }

  // ===== PASO 3: Comparar precios entre Sales Channels =====
  console.log('\n━━━ PASO 3: Comparando precios entre Sales Channels ━━━\n');

  for (const [store, info] of Object.entries(foundAccounts)) {
    const channels = channelsMap[store];
    if (!channels || channels.length === 0) continue;
    if (info.data.length === 0) continue;

    const activeChannels = channels.filter(c => c.IsActive).slice(0, 5);
    console.log(`\n📍 ${store} — Probando ${activeChannels.length} sales channels con EAN ${testEan}`);
    
    const baseUrl = info.isDirect 
      ? `https://${info.account}` 
      : `https://${info.account}.vtexcommercestable.com.br`;
    
    for (const ch of activeChannels) {
      try {
        const url = `${baseUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${testEan}&sc=${ch.Id}`;
        const r = await ax.get(url);
        
        if (r.data && r.data.length > 0) {
          const product = r.data[0];
          const sku = product.items?.[0];
          const seller = sku?.sellers?.[0];
          console.log(`   [sc=${ch.Id}] "${ch.Name}" → $${seller?.commertialOffer?.Price} (ListPrice: $${seller?.commertialOffer?.ListPrice})`);
        } else {
          console.log(`   [sc=${ch.Id}] "${ch.Name}" → Sin resultados`);
        }
      } catch (e) {
        console.log(`   [sc=${ch.Id}] "${ch.Name}" → Error: ${e.response?.status || e.message}`);
      }
      await sleep(300);
    }
  }

  // ===== PASO 4: Probar con múltiples EANs en los canales que funcionen =====
  console.log('\n━━━ PASO 4: Comparando 10 EANs entre canales ━━━\n');

  for (const [store, info] of Object.entries(foundAccounts)) {
    const channels = channelsMap[store];
    if (!channels || channels.length <= 1) continue;
    
    const activeChannels = channels.filter(c => c.IsActive).slice(0, 3);
    if (activeChannels.length <= 1) continue;

    console.log(`\n📍 ${store} — Comparando canales: ${activeChannels.map(c => c.Name).join(' vs ')}`);
    
    const baseUrl = info.isDirect 
      ? `https://${info.account}` 
      : `https://${info.account}.vtexcommercestable.com.br`;

    let diffCount = 0;
    let sameCount = 0;
    let errorCount = 0;

    for (const ean of TEST_EANS) {
      const pricesPerChannel = {};
      let productName = '';
      
      for (const ch of activeChannels) {
        try {
          const url = `${baseUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}&sc=${ch.Id}`;
          const r = await ax.get(url);
          
          if (r.data && r.data.length > 0) {
            const product = r.data[0];
            productName = product.productName;
            const sku = product.items?.[0];
            const seller = sku?.sellers?.[0];
            pricesPerChannel[ch.Id] = {
              name: ch.Name,
              price: seller?.commertialOffer?.Price,
              listPrice: seller?.commertialOffer?.ListPrice,
              seller: seller?.sellerName,
            };
          }
        } catch (e) {
          // skip
        }
        await sleep(200);
      }

      const prices = Object.values(pricesPerChannel);
      if (prices.length >= 2) {
        const allSamePrice = prices.every(p => p.price === prices[0].price);
        if (allSamePrice) {
          sameCount++;
          console.log(`  🟢 ${productName || ean} — $${prices[0].price} (igual en todos)`);
        } else {
          diffCount++;
          console.log(`  🔴 ${productName || ean} — PRECIOS DIFERENTES:`);
          for (const [chId, p] of Object.entries(pricesPerChannel)) {
            console.log(`     sc=${chId} (${p.name}): $${p.price}`);
          }
        }
      } else if (prices.length === 1) {
        console.log(`  ⚠️ ${productName || ean} — Solo disponible en 1 canal: $${prices[0].price}`);
      } else {
        errorCount++;
        console.log(`  ❌ EAN ${ean} — No encontrado`);
      }
    }

    console.log(`\n  📊 Resumen ${store}: ${diffCount} diferentes | ${sameCount} iguales | ${errorCount} no encontrados`);
  }

  // ===== PASO 5: Probar Checkout Simulation con diferentes sales channels =====
  console.log('\n━━━ PASO 5: Checkout Simulation con Sales Channels ━━━\n');

  for (const [store, info] of Object.entries(foundAccounts)) {
    if (info.data.length === 0) continue;
    
    const channels = channelsMap[store];
    if (!channels || channels.length <= 1) continue;
    
    const skuId = info.data[0].items?.[0]?.itemId;
    if (!skuId) continue;
    
    const domains = getDirectDomains(store);
    if (domains.length === 0) continue;
    
    const directUrl = `https://${domains[0]}`;
    const activeChannels = channels.filter(c => c.IsActive).slice(0, 3);
    
    console.log(`📍 ${store} — Checkout Sim SKU ${skuId} con diferentes canales + CPs`);
    
    const postalCodes = ['1001', '5500']; // CABA vs Mendoza
    
    for (const cp of postalCodes) {
      for (const ch of activeChannels) {
        const result = await checkoutSimulationWithSc(directUrl, skuId, cp, ch.Id);
        if (result && !result.error) {
          console.log(`   CP=${cp} sc=${ch.Id} (${ch.Name}): $${result.sellingPrice} | Avail: ${result.availability}`);
        } else {
          console.log(`   CP=${cp} sc=${ch.Id} (${ch.Name}): Error ${result?.error || 'N/A'}`);
        }
        await sleep(300);
      }
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('  ✅ TEST COMPLETO');
  console.log('═'.repeat(80) + '\n');
}

main().catch(e => {
  console.error('💥 Error fatal:', e.message);
  process.exit(1);
});
