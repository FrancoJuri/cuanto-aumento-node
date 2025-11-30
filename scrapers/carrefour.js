import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { DETAILED_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://www.carrefour.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Carrefour (FOLLOWER)
 */
export async function getCarrefourMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Carrefour',
    baseUrl: BASE_URL,
    categories: DETAILED_CATEGORIES,
    onProductFound: saveFollowerProduct,
    count: 50
  });
}
