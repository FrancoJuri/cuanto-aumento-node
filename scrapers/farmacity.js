import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { GENERAL_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://www.farmacity.com';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Farmacity (FOLLOWER)
 */
export async function getFarmacityMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Farmacity',
    baseUrl: BASE_URL,
    categories: GENERAL_CATEGORIES,
    onProductFound: saveFollowerProduct
  });
}
