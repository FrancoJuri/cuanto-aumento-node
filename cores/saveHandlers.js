import { supabase } from '../config/supabase.js';

/**
 * Guarda producto como MAESTRO (upsert producto + insert precio)
 * Usado por el supermercado principal que define el catálogo
 */
export async function saveMasterProduct(product, supermarketId) {
  try {
    // 1. Upsert Producto (Maestro)
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

    // 2. Insertar Precio
    const { error: priceError } = await supabase
      .from('prices')
      .insert({
        product_ean: product.ean,
        supermarket_id: supermarketId,
        price: product.price,
        product_url: product.link,
        scraped_at: new Date().toISOString()
      });

    if (priceError) {
      console.error(`❌ Error guardando precio para ${product.ean}:`, priceError.message);
      return { saved: false, reason: 'db_error' };
    }

    return { saved: true };
  } catch (error) {
    console.error(`❌ Error general guardando ${product.ean}:`, error.message);
    return { saved: false, reason: 'exception' };
  }
}

/**
 * Guarda solo el precio si el producto existe en el maestro
 * Usado por supermercados secundarios
 */
export async function saveFollowerProduct(product, supermarketId) {
  try {
    // 1. Verificar si el producto existe en nuestra DB (Maestro)
    const { data: existingProduct, error: findError } = await supabase
      .from('products')
      .select('ean')
      .eq('ean', product.ean)
      .single();

    if (findError || !existingProduct) {
      return { saved: false, reason: 'not_in_master' };
    }

    // 2. Insertar Precio
    const { error: priceError } = await supabase
      .from('prices')
      .insert({
        product_ean: product.ean,
        supermarket_id: supermarketId,
        price: product.price,
        product_url: product.link,
        scraped_at: new Date().toISOString()
      });

    if (priceError) {
      console.error(`❌ Error guardando precio para ${product.ean}:`, priceError.message);
      return { saved: false, reason: 'db_error' };
    }

    return { saved: true };
  } catch (error) {
    console.error(`❌ Error general guardando ${product.ean}:`, error.message);
    return { saved: false, reason: 'exception' };
  }
}

