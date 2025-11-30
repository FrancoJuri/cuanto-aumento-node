import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { DETAILED_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://www.jumbo.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Jumbo (FOLLOWER)
 */
export async function getJumboMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Jumbo',
    baseUrl: BASE_URL,
    categories: DETAILED_CATEGORIES,
    onProductFound: saveFollowerProduct
  });
}
