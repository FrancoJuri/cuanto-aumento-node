/**
 * Script para poblar la base de datos con productos de todos los supermercados
 * 
 * Uso:
 *   npm run scrape:all      - Ejecutar todos los scrapers
 *   npm run scrape:disco    - Solo Disco (MAESTRO)
 *   npm run scrape:carrefour - Solo Carrefour
 *   etc.
 */
import dotenv from 'dotenv';
dotenv.config();

// Importar todos los scrapers
import { getDiscoMainProducts } from '../scrapers/disco.js';
import { getCarrefourMainProducts } from '../scrapers/carrefour.js';
import { getJumboMainProducts } from '../scrapers/jumbo.js';
import { getVeaMainProducts } from '../scrapers/vea.js';
import { getDiaMainProducts } from '../scrapers/diaonline.js';
import { getMasonlineMainProducts } from '../scrapers/masonline.js';
import { getFarmacityMainProducts } from '../scrapers/farmacity.js';

// Configuración de scrapers
const SCRAPERS = {
  disco: { fn: getDiscoMainProducts, name: 'Disco', isMaster: true },
  carrefour: { fn: getCarrefourMainProducts, name: 'Carrefour' },
  jumbo: { fn: getJumboMainProducts, name: 'Jumbo' },
  vea: { fn: getVeaMainProducts, name: 'Vea' },
  dia: { fn: getDiaMainProducts, name: 'Dia Online' },
  masonline: { fn: getMasonlineMainProducts, name: 'Masonline' },
  farmacity: { fn: getFarmacityMainProducts, name: 'Farmacity' },
};

// Obtener qué scraper ejecutar desde argumentos
const args = process.argv.slice(2);
const targetScraper = args[0]; // ej: "disco", "carrefour", "all"

async function runScraper(key, scraper) {
  const label = scraper.isMaster ? `${scraper.name} (MAESTRO)` : scraper.name;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📦 Ejecutando: ${label}`);
  console.log('='.repeat(50));
  
  try {
    const result = await scraper.fn();
    if (result.success) {
      console.log(`✅ ${scraper.name}: ${result.totalProducts} productos, ${result.savedProducts} guardados`);
      return { success: true, ...result };
    } else {
      console.error(`❌ Error en ${scraper.name}:`, result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Excepción en ${scraper.name}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runAll() {
  console.log('🚀 EJECUTANDO TODOS LOS SCRAPERS');
  console.log(`📅 Fecha: ${new Date().toLocaleString('es-AR')}`);
  
  const startTime = Date.now();
  const results = {};

  // Primero ejecutar el MAESTRO (Disco) para crear productos base
  console.log('\n⭐ PASO 1: Ejecutando scraper MAESTRO (Disco)...');
  results.disco = await runScraper('disco', SCRAPERS.disco);

  // Luego ejecutar los demás (FOLLOWERS)
  console.log('\n⭐ PASO 2: Ejecutando scrapers FOLLOWERS...');
  for (const [key, scraper] of Object.entries(SCRAPERS)) {
    if (key !== 'disco') {
      results[key] = await runScraper(key, scraper);
    }
  }

  // Resumen final
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN FINAL');
  console.log('='.repeat(50));
  
  for (const [key, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    const info = result.success 
      ? `${result.totalProducts} productos, ${result.savedProducts} guardados`
      : result.error;
    console.log(`${status} ${SCRAPERS[key].name}: ${info}`);
  }
  
  console.log(`\n⏱️  Tiempo total: ${duration} minutos`);
}

async function runSingle(scraperKey) {
  if (!SCRAPERS[scraperKey]) {
    console.error(`❌ Scraper "${scraperKey}" no existe.`);
    console.log('Scrapers disponibles:', Object.keys(SCRAPERS).join(', '));
    process.exit(1);
  }

  console.log(`🚀 EJECUTANDO SCRAPER: ${SCRAPERS[scraperKey].name}`);
  console.log(`📅 Fecha: ${new Date().toLocaleString('es-AR')}`);
  
  const startTime = Date.now();
  await runScraper(scraperKey, SCRAPERS[scraperKey]);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n⏱️  Tiempo: ${duration} segundos`);
}

// Ejecutar
async function main() {
  if (!targetScraper || targetScraper === 'all') {
    await runAll();
  } else {
    await runSingle(targetScraper);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
