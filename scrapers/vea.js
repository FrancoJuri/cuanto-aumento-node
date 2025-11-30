import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { GENERAL_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://www.vea.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Vea (FOLLOWER)
 */
export async function getVeaMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Vea',
    baseUrl: BASE_URL,
    categories: GENERAL_CATEGORIES,
    onProductFound: saveFollowerProduct
  });
}
