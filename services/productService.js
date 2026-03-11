import { supabase } from '../config/supabase.js';

export async function getProducts({ page = 1, limit = 20, sort = 'name' }) {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('products')
    .select(`
      ean,
      name,
      brand,
      category,
      image_url,
      supermarket_products!inner (
        price,
        list_price,
        is_available,
        supermarkets (
          name
        )
      )
    `, { count: 'exact' })
    .eq('supermarket_products.is_available', true)
    .not('supermarket_products.price', 'is', null);

  if (sort === 'name') {
    query = query.order('relevance', { ascending: false }).order('name', { ascending: true });
  }
  
  query = query.range(offset, offset + limit - 1);

  const { data: products, error, count } = await query;
  
  if (error) throw error;

  const processedProducts = products.map(product => {
    const validPrices = product.supermarket_products
      .filter(sp => sp.is_available && sp.price !== null)
      .map(sp => ({
        supermarket: sp.supermarkets?.name,
        price: sp.price,
        list_price: sp.list_price,
      }));

    if (validPrices.length === 0) return null;

    const min_price = Math.min(...validPrices.map(p => p.price));

    return {
      ean: product.ean,
      name: product.name,
      brand: product.brand,
      category: product.category,
      image_url: product.image_url,
      prices: validPrices,
      min_price,
    };
  }).filter(p => p !== null);

  if (sort === 'price') {
    processedProducts.sort((a, b) => a.min_price - b.min_price);
  }

  return {
    products: processedProducts,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

export async function getProductsByCategory({ category, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  
  const { data: products, error, count } = await supabase
    .from('products')
    .select(`
      ean,
      name,
      brand,
      category,
      image_url,
      supermarket_products (
        price,
        list_price,
        is_available,
        supermarkets (
          name
        )
      )
    `, { count: 'exact' })
    .ilike('category', `%${category}%`)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const processedProducts = products.map(product => ({
    ...product,
    supermarket_products: undefined,
    prices: product.supermarket_products
      .filter(sp => sp.is_available)
      .map(sp => ({
        supermarket: sp.supermarkets?.name,
        price: sp.price,
        list_price: sp.list_price,
      })),
    min_price: Math.min(...product.supermarket_products
      .filter(sp => sp.is_available && sp.price)
      .map(sp => sp.price)) || null,
  }));

  return {
    products: processedProducts,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}


export async function getProductByEan(ean) {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('ean', ean)
    .single();

  if (productError) {
    if (productError.code === 'PGRST116') {
      return null; 
    }
    throw productError;
  }

  const { data: supermarketProducts, error: spError } = await supabase
    .from('supermarket_products')
    .select(`
      id,
      price,
      list_price,
      reference_price,
      reference_unit,
      is_available,
      product_url,
      last_checked_at,
      supermarkets (
        id,
        name
      ),
      price_history (
        price,
        list_price,
        scraped_at
      )
    `)
    .eq('product_ean', ean)
    .order('scraped_at', { foreignTable: 'price_history', ascending: false });

  if (spError) throw spError;

  
  const supermarkets = supermarketProducts.map(sp => ({
    name: sp.supermarkets?.name,
    price: sp.price,
    list_price: sp.list_price,
    reference_price: sp.reference_price,
    reference_unit: sp.reference_unit,
    is_available: sp.is_available,
    product_url: sp.product_url,
    last_checked_at: sp.last_checked_at,
    price_history: sp.price_history.map(ph => ({
      price: ph.price,
      list_price: ph.list_price,
      date: ph.scraped_at,
    })),
  }));

  // Calcular precio mínimo actual
  const availablePrices = supermarkets
    .filter(s => s.is_available && s.price)
    .map(s => s.price);
  
  const minPrice = availablePrices.length > 0 
    ? Math.min(...availablePrices) 
    : null;

  const cheapestSupermarket = supermarkets.find(
    s => s.is_available && s.price === minPrice
  );

  return {
    ...product,
    supermarkets,
    min_price: minPrice,
    cheapest_at: cheapestSupermarket?.name || null,
  };
}

/**
 * Busca productos por nombre
 */
export async function searchProducts({ query, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  
  const { data: products, error, count } = await supabase
    .from('products')
    .select(`
      ean,
      name,
      brand,
      category,
      image_url,
      supermarket_products (
        price,
        list_price,
        is_available,
        supermarkets (
          name
        )
      )
    `, { count: 'exact' })
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const processedProducts = products.map(product => ({
    ...product,
    supermarket_products: undefined,
    prices: product.supermarket_products
      .filter(sp => sp.is_available)
      .map(sp => ({
        supermarket: sp.supermarkets?.name,
        price: sp.price,
        list_price: sp.list_price,
      })),
    min_price: Math.min(...product.supermarket_products
      .filter(sp => sp.is_available && sp.price)
      .map(sp => sp.price)) || null,
  }));

  return {
    products: processedProducts,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

/**
 * Obtiene lista de categorías únicas
 */
export async function getCategories() {
  const { data, error } = await supabase
    .from('products')
    .select('category')
    .not('category', 'is', null);

  if (error) throw error;

  // Obtener categorías únicas y contarlas
  const categoryCount = {};
  data.forEach(row => {
    const cat = row.category;
    if (cat) {
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }
  });

  const categories = Object.entries(categoryCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { categories };
}


export async function getCheapestForProduct(ean) {
  const { data: supermarketProducts, error } = await supabase
    .from('supermarket_products')
    .select(`
      price,
      list_price,
      is_available,
      product_url,
      supermarkets (
        name
      )
    `)
    .eq('product_ean', ean)
    .eq('is_available', true)
    .not('price', 'is', null)
    .order('price', { ascending: true })
    .limit(1);

  if (error) throw error;

  if (supermarketProducts.length === 0) {
    return null;
  }

  const cheapest = supermarketProducts[0];
  

  const { data: allPrices, error: allError } = await supabase
    .from('supermarket_products')
    .select(`
      price,
      supermarkets (
        name
      )
    `)
    .eq('product_ean', ean)
    .eq('is_available', true)
    .not('price', 'is', null);

  if (allError) throw allError;

  const maxPrice = Math.max(...allPrices.map(sp => sp.price));
  const savings = maxPrice - cheapest.price;
  const savingsPercent = ((savings / maxPrice) * 100).toFixed(1);

  return {
    supermarket: cheapest.supermarkets?.name,
    price: cheapest.price,
    list_price: cheapest.list_price,
    product_url: cheapest.product_url,
    savings: savings > 0 ? savings : 0,
    savings_percent: savings > 0 ? parseFloat(savingsPercent) : 0,
    compared_to: allPrices.length,
  };
}


export async function getCategoryStats() {
  
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      category,
      supermarket_products (
        price,
        is_available
      )
    `)
    .not('category', 'is', null);

  if (error) throw error;

  const categoryStats = {};
  
  products.forEach(product => {
    const cat = product.category;
    if (!cat) return;
    
    if (!categoryStats[cat]) {
      categoryStats[cat] = {
        name: cat,
        product_count: 0,
        prices: [],
      };
    }
    
    categoryStats[cat].product_count++;
    
    product.supermarket_products
      .filter(sp => sp.is_available && sp.price)
      .forEach(sp => {
        categoryStats[cat].prices.push(sp.price);
      });
  });

  const stats = Object.values(categoryStats).map(cat => {
    const prices = cat.prices;
    const avg = prices.length > 0 
      ? prices.reduce((a, b) => a + b, 0) / prices.length 
      : 0;
    const min = prices.length > 0 ? Math.min(...prices) : 0;
    const max = prices.length > 0 ? Math.max(...prices) : 0;
    
    return {
      category: cat.name,
      product_count: cat.product_count,
      avg_price: Math.round(avg * 100) / 100,
      min_price: min,
      max_price: max,
      price_range: max - min,
    };
  }).sort((a, b) => b.product_count - a.product_count);

  return { stats };
}
