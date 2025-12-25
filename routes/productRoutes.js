import { Router } from 'express';
import { cacheMiddleware, CACHE_TTL } from '../middlewares/cacheMiddleware.js';
import {
  getProducts,
  getProductsByCategory,
  getProductByEan,
  searchProducts,
  getCategories,
  getCheapestForProduct,
  getCategoryStats,
} from '../services/productService.js';

const router = Router();

/**
 * GET /api/products
 * Lista paginada de productos para homepage
 * Query params: page, limit, sort
 */
router.get('/products', cacheMiddleware(CACHE_TTL.PRODUCTS_LIST), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
    const sort = req.query.sort || 'name';

    const result = await getProducts({ page, limit, sort });
    res.json(result);
  } catch (error) {
    console.error('Error en GET /products:', error);
    res.status(500).json({ 
      error: 'Error al obtener productos',
      message: error.message 
    });
  }
});

/**
 * GET /api/products/search
 * Búsqueda de productos por nombre o marca
 * Query params: q (required), page, limit
 */
router.get('/products/search', cacheMiddleware(CACHE_TTL.SEARCH), async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Query inválida',
        message: 'El parámetro "q" debe tener al menos 2 caracteres' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await searchProducts({ query: query.trim(), page, limit });
    res.json(result);
  } catch (error) {
    console.error('Error en GET /products/search:', error);
    res.status(500).json({ 
      error: 'Error al buscar productos',
      message: error.message 
    });
  }
});

/**
 * GET /api/products/category/:category
 * Productos filtrados por categoría
 * Query params: page, limit
 */
router.get('/products/category/:category', cacheMiddleware(CACHE_TTL.PRODUCTS_CATEGORY), async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const result = await getProductsByCategory({ category, page, limit });
    res.json(result);
  } catch (error) {
    console.error('Error en GET /products/category:', error);
    res.status(500).json({ 
      error: 'Error al obtener productos por categoría',
      message: error.message 
    });
  }
});

/**
 * GET /api/products/:ean
 * Detalle de un producto con historial de precios completo
 */
router.get('/products/:ean', cacheMiddleware(CACHE_TTL.PRODUCT_DETAIL), async (req, res) => {
  try {
    const { ean } = req.params;

    // Validar EAN (13 dígitos típicamente)
    if (!ean || ean.length < 8) {
      return res.status(400).json({ 
        error: 'EAN inválido',
        message: 'El EAN debe tener al menos 8 caracteres' 
      });
    }

    const product = await getProductByEan(ean);
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Producto no encontrado',
        message: `No existe un producto con EAN: ${ean}` 
      });
    }

    res.json(product);
  } catch (error) {
    console.error('Error en GET /products/:ean:', error);
    res.status(500).json({ 
      error: 'Error al obtener producto',
      message: error.message 
    });
  }
});

/**
 * GET /api/products/:ean/cheapest
 * Obtiene el supermercado más barato para un producto
 */
router.get('/products/:ean/cheapest', cacheMiddleware(CACHE_TTL.PRODUCTS_LIST), async (req, res) => {
  try {
    const { ean } = req.params;

    const cheapest = await getCheapestForProduct(ean);
    
    if (!cheapest) {
      return res.status(404).json({ 
        error: 'No disponible',
        message: 'No hay precios disponibles para este producto' 
      });
    }

    res.json(cheapest);
  } catch (error) {
    console.error('Error en GET /products/:ean/cheapest:', error);
    res.status(500).json({ 
      error: 'Error al obtener precio más barato',
      message: error.message 
    });
  }
});

/**
 * GET /api/categories
 * Lista de todas las categorías con conteo de productos
 */
router.get('/categories', cacheMiddleware(CACHE_TTL.CATEGORIES), async (req, res) => {
  try {
    const result = await getCategories();
    res.json(result);
  } catch (error) {
    console.error('Error en GET /categories:', error);
    res.status(500).json({ 
      error: 'Error al obtener categorías',
      message: error.message 
    });
  }
});

/**
 * GET /api/stats/categories
 * Estadísticas de precios por categoría
 */
router.get('/stats/categories', cacheMiddleware(CACHE_TTL.STATS), async (req, res) => {
  try {
    const result = await getCategoryStats();
    res.json(result);
  } catch (error) {
    console.error('Error en GET /stats/categories:', error);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas',
      message: error.message 
    });
  }
});

export default router;
