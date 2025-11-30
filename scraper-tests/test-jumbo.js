// test-jumbo.js
// Test simple para verificar que el scraper funciona SIN guardar en la DB
import 'dotenv/config';
import { fetchVtexProducts } from '../cores/vtex.js';

const BASE_URL = 'https://www.jumbo.com.ar';
const SOURCE = 'jumbo';

// Solo algunas categorías para probar
const TEST_CATEGORIES = ['Leches', 'Gaseosas', 'Cuidado Oral'];

async function test() {
  console.log('🧪 TEST DE SCRAPER - JUMBO');
  console.log('=' .repeat(50));
  console.log('⚠️  Este test NO guarda en la base de datos\n');

  const allProducts = [];

  for (const category of TEST_CATEGORIES) {
    console.log(`🔍 Buscando: "${category}"...`);
    
    const products = await fetchVtexProducts(BASE_URL, category, SOURCE, 10);
    
    if (products.length > 0) {
      console.log(`   ✅ ${products.length} productos encontrados\n`);
      allProducts.push(...products);
    } else {
      console.log(`   ❌ Sin resultados\n`);
    }
  }

  console.log('=' .repeat(50));
  console.log(`📊 TOTAL: ${allProducts.length} productos encontrados\n`);

  if (allProducts.length > 0) {
    console.log('📦 PRODUCTOS OBTENIDOS:');
    console.log('-'.repeat(50));
    
    allProducts.forEach((p, i) => {
      console.log(`\n[${i + 1}] ${p.name}`);
      console.log(`    EAN: ${p.ean}`);
      console.log(`    Precio: $${p.price}`);
      console.log(`    Marca: ${p.brand}`);
      console.log(`    Link: ${p.link}`);
    });
  }
}

test().catch(console.error);
