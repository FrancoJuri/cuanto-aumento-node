import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveMasterProduct } from '../cores/saveHandlers.js';
import { DETAILED_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://www.disco.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Disco (MAESTRO)
 */
export async function getDiscoMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Disco',
    baseUrl: BASE_URL,
    categories: DETAILED_CATEGORIES,
    onProductFound: saveMasterProduct,
    count: 50
  });
}
