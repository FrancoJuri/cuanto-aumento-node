import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveFollowerProduct } from '../cores/saveHandlers.js';
import { DETAILED_CATEGORIES } from '../cores/categories.js';
import { getAllProductEans } from '../cores/dbUtils.js';

const BASE_URL = 'https://www.masonline.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Masonline (FOLLOWER)
 */
export async function getMasonlineMainProducts(mode = 'categories') {
  const useEans = mode === 'eans';
  let categoriesToScrape = DETAILED_CATEGORIES;

  if (useEans) {
    categoriesToScrape = await getAllProductEans();
  }

  return await scrapeVtexSupermarket({
    supermarketName: 'Masonline',
    baseUrl: BASE_URL,
    categories: categoriesToScrape,
    onProductFound: saveFollowerProduct,
    count: useEans ? 1 : 50
  });
}
