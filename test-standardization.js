import { getDiscoMainProducts } from './scrapers/disco.js';
import { getCarrefourMainProducts } from './scrapers/carrefour.js';
import dotenv from 'dotenv';

dotenv.config();

async function testScrapers() {
  console.log('🧪 Iniciando prueba de estandarización de scrapers...');

  try {
    // 1. Probar Disco
    console.log('\n🔵 Probando Disco...');
    const discoResult = await getDiscoMainProducts();
    
    if (discoResult.success && discoResult.products.length > 0) {
      const p = discoResult.products[0];
      console.log('✅ Disco OK. Ejemplo de producto:');
      console.log(`   - Nombre: ${p.name}`);
      console.log(`   - Marca: ${p.brand}`);
      console.log(`   - EAN: ${p.ean}`);
      console.log(`   - Precio: ${p.price}`);
      console.log(`   - Descripción: ${p.description ? p.description.substring(0, 50) + '...' : 'N/A'}`);
      console.log(`   - Imágenes (${p.images?.length}):`, p.images);
      console.log('   💾 Datos para DB (Products):', {
        ean: p.ean,
        name: p.name,
        brand: p.brand,
        image_url: p.image,
        category: p.categories?.[0]
      });
      
      if (!Array.isArray(p.images) || p.images.length === 0) {
        console.error('❌ Error: Disco no devolvió array de imágenes');
      }
    } else {
      console.error('❌ Error en Disco:', discoResult.error || 'Sin productos');
    }

    // 2. Probar Carrefour
    console.log('\n🔴 Probando Carrefour...');
    const carrefourResult = await getCarrefourMainProducts();
    
    if (carrefourResult.success && carrefourResult.products.length > 0) {
      const p = carrefourResult.products[0];
      console.log('✅ Carrefour OK. Ejemplo de producto:');
      console.log(`   - Nombre: ${p.name}`);
      console.log(`   - Marca: ${p.brand}`);
      console.log(`   - EAN: ${p.ean}`);
      console.log(`   - Precio: ${p.price}`);
      console.log(`   - Descripción: ${p.description ? p.description.substring(0, 50) + '...' : 'N/A'}`);
      console.log(`   - Imágenes (${p.images?.length}):`, p.images);
      console.log('   💾 Datos para DB (Prices):', {
        product_ean: p.ean,
        price: p.price,
        scraped_at: new Date().toISOString()
      });

      if (!Array.isArray(p.images) || p.images.length === 0) {
        console.error('❌ Error: Carrefour no devolvió array de imágenes');
      }
    } else {
      console.error('❌ Error en Carrefour:', carrefourResult.error || 'Sin productos');
    }

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

testScrapers();
