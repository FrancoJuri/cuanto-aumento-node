/**
 * ============================================================================
 * 🧪 TEST: Comparación de precios regionales
 * ============================================================================
 * 
 * Compara precios de 5 productos en 3 regiones usando Session API + Catalog.
 * Usa el mismo enfoque que vtexRegional.js (createVtexSession + getRegionalPrice).
 * 
 * Ejecutar: node scripts/test-regional-compare.js
 *           node scripts/test-regional-compare.js jumbo   # otra tienda
 * ============================================================================
 */

import 'dotenv/config';
import { createVtexSession, getRegionalPrice, VTEX_ACCOUNTS, POSTAL_CODES } from '../cores/vtexRegional.js';

// Usar todas las regiones de vtexRegional.js
const TEST_REGIONS = POSTAL_CODES;

// 5 EANs de distintas categorías (productos que existen en Disco)
const TEST_EANS = [
  { ean: '7790040143500', desc: 'Galletitas Amor (Almacen)' },
  { ean: '7793913001822', desc: 'Leche Tregar Entera 1L (Lacteos)' },
  { ean: '7793253003715', desc: 'Lavandina Ayudin 1L (Limpieza)' },
  { ean: '7791293043791', desc: 'Desodorante Axe Marine (Perfumeria)' },
  { ean: '7795711000885', desc: 'Capelletis Villa Dagri (Pastas)' },
  { ean: '7790895007057', desc: 'Coca Cola Sabor Original 1.5L' },
  { ean: '7791120031557', desc: 'Yerba Mate Playadito 500g' },
  { ean: '7791293042688', desc: 'Desodorante Dove Original' },
  { ean: '7798094030713', desc: 'Queso Cremon La Serenisima' },
  { ean: '7790070411716', desc: 'Cerveza Quilmes Clásica 1L' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Elegir store
  const storeArg = process.argv[2];
  const storeName = storeArg
    ? Object.keys(VTEX_ACCOUNTS).find(k => k.toLowerCase() === storeArg.toLowerCase()) || storeArg
    : 'Carrefour'; // Default a Carrefour para ver diferencias reales

  const account = VTEX_ACCOUNTS[storeName];
  if (!account) {
    console.error(`Store "${storeName}" no encontrado en VTEX_ACCOUNTS`);
    console.log('Disponibles:', Object.keys(VTEX_ACCOUNTS).join(', '));
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log(`  COMPARACION DE PRECIOS REGIONALES`);
  console.log(`  Store: ${storeName} | Regiones: ${Object.keys(TEST_REGIONS).join(', ')}`);
  console.log('='.repeat(70));

  // Crear una sesión por región
  const sessions = {};
  for (const [label, postalCode] of Object.entries(TEST_REGIONS)) {
    console.log(`\nCreando sesion para ${label} (CP ${postalCode})...`);
    try {
      sessions[label] = await createVtexSession(account.directUrl, postalCode);
      console.log(`   OK - Sesion creada`);
    } catch (err) {
      console.error(`   ERROR creando sesion: ${err.message}`);
    }
    await sleep(500);
  }

  const activeRegions = Object.keys(sessions);
  if (activeRegions.length === 0) {
    console.error('\nNo se pudo crear ninguna sesion. Abortando.');
    process.exit(1);
  }

  // Tabla de resultados
  const results = [];

  console.log('\n' + '-'.repeat(70));
  console.log('  Scrapeando precios...');
  console.log('-'.repeat(70));

  for (const { ean, desc } of TEST_EANS) {
    console.log(`\n  ${desc}`);
    console.log(`  EAN: ${ean}`);

    const row = { desc, ean, prices: {} };

    for (const region of activeRegions) {
      const client = sessions[region];
      const result = await getRegionalPrice(client, account.directUrl, ean);

      if (result) {
        row.prices[region] = {
          price: result.price,
          listPrice: result.listPrice,
          available: result.isAvailable,
          seller: result.sellerName,
        };
        console.log(`    ${region}: $${result.price} (lista: $${result.listPrice}) | seller: ${result.sellerName} | stock: ${result.isAvailable ? 'si' : 'no'}`);
      } else {
        row.prices[region] = null;
        console.log(`    ${region}: No encontrado`);
      }

      await sleep(300);
    }

    results.push(row);
  }

  // Resumen comparativo
  console.log('\n\n' + '='.repeat(70));
  console.log('  TABLA COMPARATIVA');
  console.log('='.repeat(70));

  // Header
  const regionHeaders = activeRegions.map(r => r.padStart(12)).join(' |');
  console.log(`\n  ${'Producto'.padEnd(35)} |${regionHeaders} | Dif?`);
  console.log('  ' + '-'.repeat(35 + activeRegions.length * 15 + 8));

  let totalDiff = 0;
  let totalSame = 0;
  let totalMissing = 0;

  for (const row of results) {
    const shortDesc = row.desc.length > 33 ? row.desc.slice(0, 33) + '..' : row.desc;
    const prices = activeRegions.map(r => {
      const p = row.prices[r];
      return p ? `$${p.price}`.padStart(12) : '    N/A     ';
    });

    // Detectar diferencias
    const validPrices = activeRegions
      .map(r => row.prices[r]?.price)
      .filter(p => p != null);

    let diffMarker = '';
    if (validPrices.length < 2) {
      diffMarker = '  ---';
      totalMissing++;
    } else {
      const allSame = validPrices.every(p => Math.abs(p - validPrices[0]) < 0.01);
      if (allSame) {
        diffMarker = '  =';
        totalSame++;
      } else {
        diffMarker = '  DIF!';
        totalDiff++;
      }
    }

    console.log(`  ${shortDesc.padEnd(35)} |${prices.join(' |')} |${diffMarker}`);
  }

  console.log('\n  ' + '-'.repeat(35 + activeRegions.length * 15 + 8));
  console.log(`  Con diferencia: ${totalDiff} | Iguales: ${totalSame} | Datos insuficientes: ${totalMissing}`);

  // Detalle de diferencias
  if (totalDiff > 0) {
    console.log('\n  Detalle de diferencias:');
    for (const row of results) {
      const validPrices = activeRegions
        .map(r => ({ region: r, price: row.prices[r]?.price }))
        .filter(p => p.price != null);

      if (validPrices.length < 2) continue;
      const allSame = validPrices.every(p => Math.abs(p.price - validPrices[0].price) < 0.01);
      if (allSame) continue;

      const min = Math.min(...validPrices.map(p => p.price));
      const max = Math.max(...validPrices.map(p => p.price));
      const pctDiff = ((max - min) / min * 100).toFixed(1);

      console.log(`     ${row.desc}`);
      for (const p of validPrices) {
        const marker = p.price === max ? ' (mas caro)' : p.price === min ? ' (mas barato)' : '';
        console.log(`       ${p.region}: $${p.price}${marker}`);
      }
      console.log(`       Diferencia: ${pctDiff}%`);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
