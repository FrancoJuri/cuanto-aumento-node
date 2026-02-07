import { supabase } from '../config/supabase.js';

// Configuration: Keywords and their relevance scores
// Higher score = Higher position in results
const RELEVANCE_RULES = [
  // Tier 1: Essentials / High Traffic (Score 90-100)
  { keyword: 'Coca Cola', score: 100, limit: 2 }, 
  { keyword: 'Arroz', score: 90, limit: 3 },
  { keyword: 'Aceite', score: 90, limit: 3 },
  { keyword: 'Leche', score: 90, limit: 3 },
  { keyword: 'Fideos', score: 90, limit: 2 },
  { keyword: 'Azucar', score: 90, limit: 2 },
  { keyword: 'Yerba', score: 90, limit: 2 },
  
  // Tier 2: Popular / Secondary Essentials (Score 70-89)
  { keyword: 'Galletitas', score: 80, limit: 2 },
  { keyword: 'Pan', score: 80, limit: 2 },
  { keyword: 'Agua', score: 80, limit: 2 },
  { keyword: 'Cerveza', score: 75, limit: 2 },
  { keyword: 'Vino', score: 75, limit: 2 },
  { keyword: 'Papel Higienico', score: 70, limit: 2 },
  { keyword: 'Detergente', score: 70, limit: 2 },

  // Tier 3: Common Categories (Score 50-69)
  { keyword: 'Yogur', score: 60, limit: 3 },
  { keyword: 'Queso', score: 60, limit: 3 },
  { keyword: 'Manteca', score: 60, limit: 1 },
  { keyword: 'Jabon', score: 50, limit: 2 },
  { keyword: 'Shampoo', score: 50, limit: 3 },
];

async function initializeRelevance() {
  console.log('Starting relevance initialization...');
  
  // 1. Reset all to 0 first
  console.log('Resetting all products relevance to 0...');
  const { error: resetError } = await supabase
    .from('products')
    .update({ relevance: 0 })
    .gt('relevance', -1);
    
  if (resetError) {
    console.error('Error resetting relevance:', resetError);
    return;
  }

  // 2. Apply rules with limits
  for (const rule of RELEVANCE_RULES) {
    const limit = rule.limit || 2;
    console.log(`Applying rule: "${rule.keyword}" -> Score: ${rule.score} (Limit: ${limit})`);
    
    // Fetch candidates
    const { data: candidates, error } = await supabase
      .from('products')
      .select('ean, name, category')
      .or(`name.ilike.%${rule.keyword}%,category.ilike.%${rule.keyword}%`)
      .limit(50); // Fetch a pool to choose from

    if (error) {
      console.error(`Error fetching candidates for"${rule.keyword}":`, error);
      continue;
    }

    if (!candidates || candidates.length === 0) {
      console.log(`No products found for "${rule.keyword}"`);
      continue;
    }

    // Heuristic: Prefer shorter names (usually means "Coca Cola 1.5L" vs "Pack x 6 Coca Cola...")
    // and prefer items that actually contain the keyword in the name (stronger match)
    const sortedCandidates = candidates.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const lowerKeyword = rule.keyword.toLowerCase();
      
      const aHasKeyword = aName.includes(lowerKeyword);
      const bHasKeyword = bName.includes(lowerKeyword);

      if (aHasKeyword && !bHasKeyword) return -1;
      if (!aHasKeyword && bHasKeyword) return 1;

      return aName.length - bName.length;
    });

    // Select top N
    const selected = sortedCandidates.slice(0, limit);
    const selectedEans = selected.map(p => p.ean);

    // Update these specific products
    if (selectedEans.length > 0) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ relevance: rule.score })
        .in('ean', selectedEans);

      if (updateError) {
         console.error(`Error updating relevance for "${rule.keyword}":`, updateError);
      } else {
         console.log(`Updated ${selectedEans.length} products for "${rule.keyword}": ${selected.map(p => p.name).join(', ')}`);
      }
    }
  }

  console.log('Relevance initialization complete!');
}

initializeRelevance()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
