import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import pLimit from 'p-limit';
import { supabase } from '../config/supabase.js';

export const VTEX_ACCOUNTS = {
  'Disco': {
    directUrl: 'https://www.disco.com.ar',
    backendUrl: 'https://discoargentina.vtexcommercestable.com.br',
  },
  'Jumbo': {
    directUrl: 'https://www.jumbo.com.ar',
    backendUrl: 'https://jumboargentina.vtexcommercestable.com.br',
  },
  'Carrefour': {
    directUrl: 'https://www.carrefour.com.ar',
    backendUrl: 'https://carrefourar.vtexcommercestable.com.br',
  },
  'Vea': {
    directUrl: 'https://www.vea.com.ar',
    backendUrl: 'https://veaargentina.vtexcommercestable.com.br',
  },
  'Dia': {
    directUrl: 'https://diaonline.supermercadosdia.com.ar',
    backendUrl: 'https://diaonline.supermercadosdia.com.ar',
  },
  'Masonline': {
    directUrl: 'https://www.masonline.com.ar',
    backendUrl: 'https://www.masonline.com.ar',
  },
  'Farmacity': {
    directUrl: 'https://www.farmacity.com',
    backendUrl: 'https://www.farmacity.com',
  },
};

// Postal codes for all Argentine provinces
export const POSTAL_CODES = {
  'CABA':             '1001',
  'Buenos Aires':     '1900', // La Plata
  'Catamarca':        '4700',
  'Chaco':            '3500',
  'Chubut':           '9100', // Rawson
  'Córdoba':          '5000',
  'Corrientes':       '3400',
  'Entre Ríos':       '3100', // Paraná
  'Formosa':          '3600',
  'Jujuy':            '4600', // San Salvador
  'La Pampa':         '6300', // Santa Rosa
  'La Rioja':         '5300',
  'Mendoza':          '5500',
  'Misiones':         '3300', // Posadas
  'Neuquén':          '8300',
  'Río Negro':        '8500', // Viedma
  'Salta':            '4400',
  'San Juan':         '5400',
  'San Luis':         '5700',
  'Santa Cruz':       '9400', // Río Gallegos
  'Santa Fe':         '3000',
  'Santiago del Estero': '4200',
  'Tierra del Fuego': '9410', // Ushuaia
  'Tucumán':          '4000',
  'Rosario':          '2000',
  'Mar del Plata':    '7600',
  'Bahía Blanca':     '8000',
};

/**
 * Creates a VTEX session with a specific postal code.
 * Returns a cookie-enabled axios client that can be reused for multiple queries.
 */
export async function createVtexSession(directUrl, postalCode, country = 'ARG') {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  }));

  // Create empty session first
  await client.get(`${directUrl}/api/sessions?items=public.postalCode,checkout.regionId`);

  // Inject postal code
  await client.post(`${directUrl}/api/sessions`, {
    public: {
      country: { value: country },
      postalCode: { value: postalCode },
    },
  });

  return client;
}

/**
 * Fetches a product by EAN using the Catalog System API with session cookies.
 */
export async function getRegionalPrice(client, backendUrl, ean) {
  try {
    const { data } = await client.get(
      `${backendUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`
    );

    if (!data || data.length === 0) return null;

    const product = data[0];
    const item = product.items?.[0];
    const seller = item?.sellers?.find(s => s.sellerDefault) || item?.sellers?.[0];
    const offer = seller?.commertialOffer;

    if (!offer) return null;

    return {
      ean,
      name: product.productName,
      productId: product.productId,
      skuId: item?.itemId || null,
      price: offer.Price ?? null,
      listPrice: offer.ListPrice ?? null,
      isAvailable: (offer.AvailableQuantity ?? 0) > 0,
      sellerId: seller?.sellerId || null,
      sellerName: seller?.sellerName || null,
    };
  } catch (error) {
    if (error.response?.status !== 404) {
      // Silently skip common errors during bulk scraping
    }
    return null;
  }
}

/**
 * Gets the supermarket ID from the database.
 */
async function getSupermarketId(name) {
  const { data } = await supabase
    .from('supermarkets')
    .select('id')
    .eq('name', name)
    .single();
  return data?.id || null;
}

/**
 * Saves a regional price to the database.
 * Upserts into regional_prices and inserts into regional_price_history if price changed.
 */
async function saveRegionalPrice(product, supermarketId, postalCode, regionLabel) {
  // First check if existing price differs to determine if history entry is needed
  const { data: existing } = await supabase
    .from('regional_prices')
    .select('id, price')
    .eq('product_ean', product.ean)
    .eq('supermarket_id', supermarketId)
    .eq('postal_code', postalCode)
    .single();

  const { data: rpData, error: rpError } = await supabase
    .from('regional_prices')
    .upsert({
      product_ean: product.ean,
      supermarket_id: supermarketId,
      postal_code: postalCode,
      region_label: regionLabel,
      sku_id: product.skuId,
      seller_id: product.sellerId,
      seller_name: product.sellerName,
      price: product.price,
      list_price: product.listPrice,
      is_available: product.isAvailable,
      last_checked_at: new Date().toISOString(),
    }, { onConflict: 'product_ean, supermarket_id, postal_code' })
    .select('id, price')
    .single();

  if (rpError) {
    console.error(`Error saving regional price for ${product.ean} CP ${postalCode}:`, rpError.message);
    return false;
  }

  // Only insert history if price changed or this is a new entry
  const priceChanged = !existing || Math.abs(parseFloat(existing.price) - parseFloat(product.price)) > 0.01;

  if (priceChanged) {
    const { error: histError } = await supabase
      .from('regional_price_history')
      .insert({
        regional_price_id: rpData.id,
        price: product.price,
        list_price: product.listPrice,
        scraped_at: new Date().toISOString(),
      });

    if (histError) {
      console.error(`Error saving regional history for ${product.ean}:`, histError.message);
    }
  }

  return true;
}

/**
 * Main function: scrapes regional prices for a supermarket across postal codes.
 *
 * @param {Object} config
 * @param {string} config.supermarketName - e.g. 'Disco'
 * @param {string[]} config.eans - list of EANs to scrape
 * @param {Object} [config.postalCodes] - override default POSTAL_CODES
 * @param {number} [config.concurrency] - parallel requests per CP (default: 15)
 * @param {boolean} [config.dryRun] - if true, don't save to DB
 */
export async function scrapeRegionalPrices({
  supermarketName,
  eans,
  postalCodes = POSTAL_CODES,
  concurrency = 15,
  dryRun = false,
}) {
  const account = VTEX_ACCOUNTS[supermarketName];
  if (!account) {
    console.error(`No VTEX account configured for ${supermarketName}`);
    return null;
  }

  let supermarketId = null;
  if (!dryRun) {
    supermarketId = await getSupermarketId(supermarketName);
    if (!supermarketId) {
      console.error(`Supermarket "${supermarketName}" not found in DB`);
      return null;
    }
  }

  const limit = pLimit(concurrency);
  const regions = Object.entries(postalCodes);

  console.log(`[Regional] ${supermarketName} | ${eans.length} EANs x ${regions.length} regions | concurrency: ${concurrency}`);

  const stats = { total: 0, saved: 0, notFound: 0, errors: 0 };

  // Sequential over regions (1 session per CP)
  for (const [regionLabel, postalCode] of regions) {
    console.log(`\n[${regionLabel}] CP ${postalCode} - Creating session...`);

    let client;
    try {
      client = await createVtexSession(account.directUrl, postalCode);
    } catch (error) {
      console.error(`[${regionLabel}] Failed to create session: ${error.message}`);
      stats.errors += eans.length;
      continue;
    }

    // Parallel over EANs within this region
    const promises = eans.map((ean, index) =>
      limit(async () => {
        stats.total++;

        if (index % 100 === 0 && index > 0) {
          console.log(`[${regionLabel}] Progress: ${index}/${eans.length}`);
        }

        const result = await getRegionalPrice(client, account.backendUrl, ean);

        if (!result) {
          stats.notFound++;
          return;
        }

        if (dryRun) {
          stats.saved++;
          if (stats.saved <= 5) {
            console.log(`  [DRY] ${result.name} | $${result.price} | seller: ${result.sellerName}`);
          }
          return;
        }

        const saved = await saveRegionalPrice(result, supermarketId, postalCode, regionLabel);
        if (saved) {
          stats.saved++;
        } else {
          stats.errors++;
        }
      })
    );

    await Promise.all(promises);
    console.log(`[${regionLabel}] Done: ${stats.saved} saved so far`);
  }

  console.log(`\n[Regional] ${supermarketName} complete:`);
  console.log(`  Total queries: ${stats.total}`);
  console.log(`  Saved: ${stats.saved}`);
  console.log(`  Not found: ${stats.notFound}`);
  console.log(`  Errors: ${stats.errors}`);

  return stats;
}
