import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scrapeRegionalPrices, VTEX_ACCOUNTS, POSTAL_CODES } from '../cores/vtexRegional.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const VALID_STORES = Object.keys(VTEX_ACCOUNTS);
const TARGET_TOTAL = 2500;
const CONCURRENCY = 30;

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/scrape-regional.js                      # update oldest regional prices');
  console.log('  node scripts/scrape-regional.js --populate            # initial population from supermarket_products');
  console.log('  node scripts/scrape-regional.js disco                 # single store (update mode)');
  console.log('  node scripts/scrape-regional.js disco --populate      # single store (populate mode)');
  console.log('  node scripts/scrape-regional.js --test                # dry run');
  console.log(`\nAvailable stores: ${VALID_STORES.join(', ')}`);
}

async function getSupermarketId(name) {
  const { data } = await supabase
    .from('supermarkets')
    .select('id')
    .eq('name', name)
    .single();
  return data?.id || null;
}

/**
 * Populate mode: gets EANs from supermarket_products for a specific store.
 * Only returns EANs that actually exist in that supermarket.
 */
async function getEansForPopulate(supermarketId) {
  let allEans = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('supermarket_products')
      .select('product_ean')
      .eq('supermarket_id', supermarketId)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching EANs:', error.message);
      break;
    }

    if (data.length > 0) {
      allEans = allEans.concat(data.map(d => d.product_ean).filter(Boolean));
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  return [...new Set(allEans)];
}

/**
 * Update mode: gets EANs from regional_prices ordered by last_checked_at (oldest first).
 * Limited to TARGET_TOTAL per store.
 */
async function getEansForUpdate(supermarketId) {
  let allEans = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore && allEans.length < TARGET_TOTAL) {
    const remaining = TARGET_TOTAL - allEans.length;
    const limit = Math.min(remaining, pageSize);
    const from = page * pageSize;
    const to = from + limit - 1;

    const { data, error } = await supabase
      .from('regional_prices')
      .select('product_ean')
      .eq('supermarket_id', supermarketId)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching regional EANs:', error.message);
      break;
    }

    if (data.length > 0) {
      allEans = allEans.concat(data.map(d => d.product_ean).filter(Boolean));
      if (data.length < limit) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  return [...new Set(allEans)];
}

async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const isPopulate = args.includes('--populate');
  const storeArg = args.find(a => !a.startsWith('--'));

  let storesToScrape = VALID_STORES;
  if (storeArg) {
    const match = VALID_STORES.find(s => s.toLowerCase() === storeArg.toLowerCase());
    if (!match) {
      console.error(`Unknown store: "${storeArg}"`);
      printUsage();
      process.exit(1);
    }
    storesToScrape = [match];
  }

  const postalCodes = isTest
    ? { 'CABA': '1001', 'Mendoza': '5500' }
    : POSTAL_CODES;

  const startTime = Date.now();
  const mode = isTest ? 'test' : isPopulate ? 'populate' : 'update';

  console.log(`Mode: ${mode}`);
  console.log(`Stores: ${storesToScrape.join(', ')}`);
  console.log(`Regions: ${Object.keys(postalCodes).length}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const allStats = {};

  for (const storeName of storesToScrape) {
    console.log('='.repeat(60));
    console.log(`Starting: ${storeName} (${mode})`);
    console.log('='.repeat(60));

    let eans;

    if (isTest) {
      eans = ['7790895067570', '7790895000997', '7790895012259'];
    } else {
      const supermarketId = await getSupermarketId(storeName);
      if (!supermarketId) {
        console.error(`Supermarket "${storeName}" not found in DB, skipping`);
        continue;
      }

      if (isPopulate) {
        console.log(`Fetching EANs from supermarket_products for ${storeName}...`);
        eans = await getEansForPopulate(supermarketId);
      } else {
        console.log(`Fetching oldest ${TARGET_TOTAL} EANs from regional_prices for ${storeName}...`);
        eans = await getEansForUpdate(supermarketId);

        if (eans.length === 0) {
          console.log(`No existing regional prices for ${storeName}. Run with --populate first.`);
          continue;
        }
      }
    }

    console.log(`EANs to process: ${eans.length}`);
    console.log(`Estimated queries: ${eans.length * Object.keys(postalCodes).length}\n`);

    const stats = await scrapeRegionalPrices({
      supermarketName: storeName,
      eans,
      postalCodes,
      concurrency: CONCURRENCY,
      dryRun: isTest,
    });

    allStats[storeName] = stats;
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('REGIONAL SCRAPING COMPLETE');
  console.log('='.repeat(60));
  console.log(`Mode: ${mode} | Total time: ${totalTime}s`);

  for (const [store, stats] of Object.entries(allStats)) {
    if (!stats) continue;
    console.log(`  ${store}: ${stats.saved} saved, ${stats.notFound} not found, ${stats.errors} errors`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
