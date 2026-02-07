import { getCache, setCache } from '../config/redis.js';

/**
 * TTL (Time To Live) en segundos para cada tipo de endpoint
 */
export const CACHE_TTL = {
  PRODUCTS_LIST: 86400,      // 24 horas
  PRODUCTS_CATEGORY: 86400,  // 24 horas
  PRODUCT_DETAIL: 86400,     // 24 horas
  CATEGORIES: 86400,         // 24 horas
  SEARCH: 3600,              // 1 hora
  STATS: 86400,              // 24 horas
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
