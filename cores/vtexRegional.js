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
  'CABA': '1001',
  'GBA Norte': '1602', // Vicente López
  'La Plata': '1900',
  'Rosario': '2000',
  'Córdoba': '5000',
  'Mendoza': '5500',
  'Tucumán': '4000',
  'Salta': '4400',
  'Neuquén': '8300',
  'Mar del Plata': '7600'
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
export async function getRegionalPrice(client, directUrl, ean) {
  try {
    const { data } = await client.get(
      `${directUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`
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

const BATCH_SIZE = 200;

/**
 * Fetches existing prices for a batch of EANs in a specific region.
 * Returns a Map of ean -> { id, price }
 */
async function getExistingPrices(eans, supermarketId, postalCode) {
  const priceMap = new Map();
  // Supabase .in() supports up to 200-300 items safely
  for (let i = 0; i < eans.length; i += BATCH_SIZE) {
    const chunk = eans.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('regional_prices')
      .select('id, product_ean, price')
      .eq('supermarket_id', supermarketId)
      .eq('postal_code', postalCode)
      .in('product_ean', chunk);

    if (error) {
      console.error(`Error fetching existing prices:`, error.message);
      continue;
    }
    for (const row of data) {
      priceMap.set(row.product_ean, { id: row.id, price: parseFloat(row.price) });
    }
  }
  return priceMap;
}

/**
 * Batch saves regional prices to the database.
 * 1. Bulk SELECT existing prices (1 query per 200 EANs)
 * 2. Bulk UPSERT all scraped results (1 query per 200 rows)
 * 3. Bulk INSERT history only for changed prices (1 query per batch)
 */
async function saveRegionalPricesBatch(results, supermarketId, postalCode, regionLabel) {
  if (results.length === 0) return { saved: 0, errors: 0 };

  const now = new Date().toISOString();
  const eans = results.map(r => r.ean);

  // 1. Bulk fetch existing prices
  const existingPrices = await getExistingPrices(eans, supermarketId, postalCode);

  let totalSaved = 0;
  let totalErrors = 0;
  const historyEntries = [];

  // 2. Upsert in chunks of BATCH_SIZE
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const chunk = results.slice(i, i + BATCH_SIZE);

    const rows = chunk.map(product => ({
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
      last_checked_at: now,
    }));

    const { data: upsertedRows, error: upsertError } = await supabase
      .from('regional_prices')
      .upsert(rows, { onConflict: 'product_ean, supermarket_id, postal_code' })
      .select('id, product_ean, price');

    if (upsertError) {
      console.error(`Error batch upserting regional prices (CP ${postalCode}):`, upsertError.message);
      totalErrors += chunk.length;
      continue;
    }

    totalSaved += upsertedRows.length;

    // 3. Determine which prices changed and queue history entries
    for (const row of upsertedRows) {
      const existing = existingPrices.get(row.product_ean);
      const newPrice = parseFloat(row.price);
      const priceChanged = !existing || Math.abs(existing.price - newPrice) > 0.01;

      if (priceChanged) {
        const product = chunk.find(p => p.ean === row.product_ean);
        historyEntries.push({
          regional_price_id: row.id,
          price: newPrice,
          list_price: product?.listPrice ?? null,
          scraped_at: now,
        });
      }
    }
  }

  // 4. Batch insert history entries
  if (historyEntries.length > 0) {
    for (let i = 0; i < historyEntries.length; i += BATCH_SIZE) {
      const chunk = historyEntries.slice(i, i + BATCH_SIZE);
      const { error: histError } = await supabase
        .from('regional_price_history')
        .insert(chunk);

      if (histError) {
        console.error(`Error batch inserting regional history:`, histError.message);
      }
    }
    console.log(`  [History] ${historyEntries.length} price changes recorded`);
  }

  return { saved: totalSaved, errors: totalErrors };
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

  const stats = { total: 0, saved: 0, notFound: 0, errors: 0, historyEntries: 0 };

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

    // Scrape all EANs for this region in parallel, accumulate results
    const regionResults = [];

    const promises = eans.map((ean, index) =>
      limit(async () => {
        stats.total++;

        if (index % 100 === 0 && index > 0) {
          console.log(`[${regionLabel}] Scraping: ${index}/${eans.length}`);
        }

        const result = await getRegionalPrice(client, account.directUrl, ean);

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

        regionResults.push(result);
      })
    );

    await Promise.all(promises);

    // Batch save all results for this region
    if (!dryRun && regionResults.length > 0) {
      console.log(`[${regionLabel}] Saving ${regionResults.length} results in batches...`);
      const { saved, errors } = await saveRegionalPricesBatch(regionResults, supermarketId, postalCode, regionLabel);
      stats.saved += saved;
      stats.errors += errors;
    }

    console.log(`[${regionLabel}] Done: ${stats.saved} saved so far`);
  }

  console.log(`\n[Regional] ${supermarketName} complete:`);
  console.log(`  Total queries: ${stats.total}`);
  console.log(`  Saved: ${stats.saved}`);
  console.log(`  Not found: ${stats.notFound}`);
  console.log(`  Errors: ${stats.errors}`);

  return stats;
}
