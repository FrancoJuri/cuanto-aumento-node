import readline from 'readline';
import { URL } from 'url';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Extractor de Hash VTEX (Carrefour/Disco)');
console.log('==========================================\n');

console.log('📋 Instrucciones:');
console.log('1. Ve a https://www.carrefour.com.ar o https://www.disco.com.ar');
console.log('2. Abre las herramientas de desarrollo (F12)');
console.log('3. Ve a la pestaña "Network" o "Red"');
console.log('4. Busca cualquier producto (ej: "a")');
console.log('5. Busca un request que contenga "operationName=productSuggestions"');
console.log('   (igual que en el proyecto de Go)');
console.log('6. Copia la URL completa del request y pégala aquí\n');

rl.question('🔗 Pega la URL del request: ', (inputUrl) => {
  try {
    const urlObj = new URL(inputUrl.trim());
    let supermarket = '';
    let targetFile = '';

    // Identificar supermercado
    if (urlObj.hostname.includes('carrefour.com.ar')) {
      supermarket = 'Carrefour';
      targetFile = 'scrapers/carrefour.js';
    } else if (urlObj.hostname.includes('disco.com.ar')) {
      supermarket = 'Disco';
      targetFile = 'scrapers/disco.js';
    } else {
      throw new Error('La URL debe ser de carrefour.com.ar o disco.com.ar');
    }
    
    // Verificar que contenga productSuggestions (como en Go)
    const operationName = urlObj.searchParams.get('operationName');
    if (operationName !== 'productSuggestions') {
      throw new Error(`La URL debe contener operationName=productSuggestions (como en el proyecto Go). Encontrado: ${operationName}`);
    }
    
    const extensionsEncoded = urlObj.searchParams.get('extensions');
    if (!extensionsEncoded) {
      throw new Error('No se encontró el parámetro "extensions" en la URL');
    }
    
    const extensionsDecoded = decodeURIComponent(extensionsEncoded);
    const extensions = JSON.parse(extensionsDecoded);
    
    const hash = extensions.persistedQuery?.sha256Hash;
    if (!hash) {
      throw new Error('No se encontró el hash sha256Hash en las extensiones');
    }
    
    console.log(`\n✅ Hash de ${supermarket} extraído exitosamente!`);
    console.log('========================================');
    console.log(`🔑 VTEX_SHA256_HASH: ${hash}`);
    console.log(`📝 Operation Name detectado: ${operationName}`);
    console.log('\n📝 Instrucciones:');
    console.log('1. Copia el hash de arriba');
    console.log(`2. Abre el archivo ${targetFile}`);
    console.log('3. Busca la constante VTEX_SHA256_HASH y reemplaza su valor');
    console.log('   con el hash copiado');
    console.log('\n✅ El scraper ya está configurado para productSuggestions (como en Go)');
    console.log('\n4. Guarda el archivo y prueba el scraper');
    console.log('\n🚀 ¡Listo para usar el scraper!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Consejos:');
    console.log('- Asegúrate de copiar la URL completa del request');
    console.log('- La URL debe ser de una búsqueda de productos');
    console.log('- Busca específicamente "productSuggestions" (como en el proyecto Go)');
    console.log('- Prueba buscando un producto simple como "a" o "arroz"');
    console.log('- Si solo ves "ProductQuery", es posible que el supermercado haya cambiado');
  }
  
  rl.close();
}); 