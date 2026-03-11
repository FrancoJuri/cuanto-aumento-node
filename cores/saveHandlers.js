import { supabase } from '../config/supabase.js';


export async function saveMasterProduct(product, supermarketId) {
  try {
    
    const { error: productError } = await supabase
      .from('products')
      .upsert({
        ean: product.ean,
        name: product.name,
        description: product.description || product.name,
        brand: product.brand,
        image_url: product.image,
        images: product.images,
        category: product.categories && product.categories.length > 0 ? product.categories[0] : null,
        product_url: product.link
      }, { onConflict: 'ean' });

    if (productError) {
      console.error(`❌ Error guardando producto ${product.ean}:`, productError.message);
      return { saved: false, reason: 'db_error' };
    }

    const { data: spData, error: spError } = await supabase
      .from('supermarket_products')
      .upsert({
        product_ean: product.ean,
        supermarket_id: supermarketId,
        external_id: product.external_id,
        product_url: product.link,
        price: product.price,
        list_price: product.list_price,
        reference_price: product.reference_price,
        reference_unit: product.reference_unit,
        is_available: product.is_available,
        sku_id: product.sku_id || null,
        seller_id: product.seller_id || null,
        seller_name: product.seller_name || null,
        last_checked_at: new Date().toISOString()
      }, { onConflict: 'product_ean, supermarket_id' })
      .select('id')
      .single();

    if (spError) {
      console.error(`❌ Error guardando supermarket_product para ${product.ean}:`, spError.message);
      return { saved: false, reason: 'db_error' };
    }

    const { error: historyError } = await supabase
      .from('price_history')
      .insert({
        supermarket_product_id: spData.id,
        price: product.price,
        list_price: product.list_price,
        scraped_at: new Date().toISOString()
      });

    if (historyError) {
      console.error(`Error guardando historial para ${product.ean}:`, historyError.message);
    }

    return { saved: true };
  } catch (error) {
    console.error(`❌ Error general guardando ${product.ean}:`, error.message);
    return { saved: false, reason: 'exception' };
  }
}

export async function saveFollowerProduct(product, supermarketId) {
  try {
    
    const { data: existingProduct, error: findError } = await supabase
      .from('products')
      .select('ean')
      .eq('ean', product.ean)
      .single();

    if (findError || !existingProduct) {
      return { saved: false, reason: 'not_in_master' };
    }

    const { data: spData, error: spError } = await supabase
      .from('supermarket_products')
      .upsert({
        product_ean: product.ean,
        supermarket_id: supermarketId,
        external_id: product.external_id,
        product_url: product.link,
        price: product.price,
        list_price: product.list_price,
        reference_price: product.reference_price,
        reference_unit: product.reference_unit,
        is_available: product.is_available,
        sku_id: product.sku_id || null,
        seller_id: product.seller_id || null,
        seller_name: product.seller_name || null,
        last_checked_at: new Date().toISOString()
      }, { onConflict: 'product_ean, supermarket_id' })
      .select('id')
      .single();

    if (spError) {
      console.error(`❌ Error guardando supermarket_product para ${product.ean}:`, spError.message);
      return { saved: false, reason: 'db_error' };
    }

    const { error: historyError } = await supabase
      .from('price_history')
      .insert({
        supermarket_product_id: spData.id,
        price: product.price,
        list_price: product.list_price,
        scraped_at: new Date().toISOString()
      });

    if (historyError) {
      console.error(`⚠️ Error guardando historial para ${product.ean}:`, historyError.message);
    }

    return { saved: true };
  } catch (error) {
    console.error(`❌ Error general guardando ${product.ean}:`, error.message);
    return { saved: false, reason: 'exception' };
  }
}

