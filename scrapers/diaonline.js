import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { GENERAL_CATEGORIES } from '../cores/categories.js';

const BASE_URL = 'https://diaonline.supermercadosdia.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Dia (FOLLOWER)
 */
export async function getDiaMainProducts() {
  return await scrapeVtexSupermarket({
    supermarketName: 'Dia',
    baseUrl: BASE_URL,
    categories: GENERAL_CATEGORIES,
    onProductFound: saveFollowerProduct
  });
}
