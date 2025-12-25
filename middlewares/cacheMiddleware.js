import { getCache, setCache } from '../config/redis.js';

/**
 * TTL (Time To Live) en segundos para cada tipo de endpoint
 */
export const CACHE_TTL = {
  PRODUCTS_LIST: 300,      // 5 minutos
  PRODUCTS_CATEGORY: 300,  // 5 minutos
  PRODUCT_DETAIL: 600,     // 10 minutos
  CATEGORIES: 3600,        // 1 hora
  SEARCH: 120,             // 2 minutos
  STATS: 3600,             // 1 hora
};

/**
 * Genera una clave de cache basada en la URL de la request
 * @param {Request} req - Request de Express
 * @returns {string} - Clave de cache
 */
function generateCacheKey(req) {
  const baseUrl = req.baseUrl + req.path;
  const queryString = new URLSearchParams(req.query).toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Middleware de cache para Express
 * @param {number} ttlSeconds - Tiempo de vida del cache en segundos
 * @returns {Function} - Middleware de Express
 */
export function cacheMiddleware(ttlSeconds = 300) {
  return async (req, res, next) => {
    const cacheKey = generateCacheKey(req);

    try {
      // Intentar obtener del cache
      const cached = await getCache(cacheKey);
      
      if (cached) {
        console.log(`📦 Cache HIT: ${cacheKey}`);
        return res.json(cached);
      }
      
      console.log(`🔍 Cache MISS: ${cacheKey}`);

      // Interceptar res.json para cachear la respuesta
      const originalJson = res.json.bind(res);
      res.json = async (data) => {
        // Solo cachear respuestas exitosas
        if (res.statusCode >= 200 && res.statusCode < 300) {
          await setCache(cacheKey, data, ttlSeconds);
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      // Si hay error en cache, continuar sin cache
      next();
    }
  };
}
