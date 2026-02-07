import { getProducts } from '../services/productService.js';

async function testRelevance() {
  console.log('Testing product relevance sorting...');
  
  try {
    // Fetch first page of products sorted by default (which should be relevance)
    const result = await getProducts({ page: 1, limit: 20 });
    
    console.log(`Fetched ${result.products.length} products.`);
    console.log('Top 20 products:');
    
    result.products.forEach((p, index) => {
      console.log(`${index + 1}. [${p.ean}] ${p.name} (Category: ${p.category})`);
    });

    // Simple assertion: Check if we have some known high-relevance items in top 10
    const topNames = result.products.slice(0, 10).map(p => p.name.toLowerCase());
    const keywordsToCheck = ['coca cola', 'arroz', 'aceite', 'leche'];
    
    let matches = 0;
    keywordsToCheck.forEach(keyword => {
      if (topNames.some(name => name.includes(keyword))) {
        matches++;
      }
    });

    if (matches > 0) {
      console.log(`\nSUCCESS: Found relevant items in top results.`);
    } else {
      console.warn(`\nWARNING: Did not find expected keywords in top results. Check if relevance was applied.`);
    }

  } catch (error) {
    console.error('Error testing relevance:', error);
  }
}

testRelevance()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
