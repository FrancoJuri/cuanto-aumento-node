import { getDiscoMainProducts } from '../scrapers/disco.js';
import { getCarrefourMainProducts } from '../scrapers/carrefour.js';
import dotenv from 'dotenv';

dotenv.config();

async function runPopulation() {
  console.log('🚀 Iniciando población de base de datos...');
  const startTime = Date.now();

  // 1. Ejecutar Disco (Maestro)
  console.log('\n📦 PASO 1: Obteniendo productos de Disco (MAESTRO)...');
  try {
    const discoResult = await getDiscoMainProducts();
    if (!discoResult.success) {
      console.error('❌ Error en Disco:', discoResult.error);
    }
  } catch (error) {
    console.error('❌ Excepción en Disco:', error);
  }

  /* // 2. Ejecutar Carrefour
  console.log('\n📦 PASO 2: Obteniendo precios de Carrefour...');
  try {
    const carrefourResult = await getCarrefourMainProducts();
    if (!carrefourResult.success) {
      console.error('❌ Error en Carrefour:', carrefourResult.error);
    }
  } catch (error) {
    console.error('❌ Excepción en Carrefour:', error);
  }
*/
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✨ Población completada en ${duration} segundos.`);
  process.exit(0);
}

runPopulation();
