import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { GENERAL_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://www.masonline.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Masonline (FOLLOWER)
 */
export async function getMasonlineMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Masonline',
    baseUrl: BASE_URL,
    categories: GENERAL_CATEGORIES,
    onProductFound: saveFollowerProduct
  });
}
