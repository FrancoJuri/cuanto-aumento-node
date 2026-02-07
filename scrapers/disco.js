import { scrapeVtexSupermarket } from '../cores/vtex.js';
import { saveMasterProduct } from '../cores/saveHandlers.js';
import { DETAILED_CATEGORIES } from '../cores/categories.js';
import { getAllProductEans } from '../cores/dbUtils.js';

const BASE_URL = 'https://www.disco.com.ar';

/**
 * 🎯 FUNCIÓN PRINCIPAL - Disco (MAESTRO)
 */
export async function getDiscoMainProducts(mode = 'categories') {
  const useEans = mode === 'eans';
  
  let categoriesToScrape = DETAILED_CATEGORIES;

  if (useEans) {
    categoriesToScrape = await getAllProductEans();
  }

  return await scrapeVtexSupermarket({
    supermarketName: 'Disco',
    baseUrl: BASE_URL,
    categories: categoriesToScrape,
    onProductFound: saveMasterProduct,
    count: useEans ? 1 : 50
  });
}
