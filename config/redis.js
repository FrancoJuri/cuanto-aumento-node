import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

// Cargar variables de entorno ANTES de usarlas
dotenv.config();

let redis = null;
let redisAvailable = false;

// Inicializar Redis solo si las credenciales están configuradas
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (upstashUrl && upstashToken) {
  try {
    redis = new Redis({
      url: upstashUrl,
      token: upstashToken,
    });
    redisAvailable = true;
    console.log('Redis (Upstash) conectado');
  } catch (error) {
    console.warn('Error conectando a Redis:', error.message);
  }
} else {
  console.warn('Redis no configurado - la API funcionará sin cache');
}

/**
 * Obtiene un valor del cache
 * @param {string} key - Clave del cache
 * @returns {Promise<any|null>} - Valor cacheado o null
 */
export async function getCache(key) {
  if (!redisAvailable || !redis) return null;
  
  try {
    const cached = await redis.get(key);
    return cached;
  } catch (error) {
    console.error('Redis GET error:', error.message);
    return null;
  }
}

/**
 * Guarda un valor en el cache
 * @param {string} key - Clave del cache
 * @param {any} value - Valor a guardar
 * @param {number} ttlSeconds - Tiempo de vida en segundos
 */
export async function setCache(key, value, ttlSeconds = 300) {
  if (!redisAvailable || !redis) return;
  
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.error('Redis SET error:', error.message);
  }
}

/**
 * Elimina una clave del cache
 * @param {string} key - Clave a eliminar
 */
export async function deleteCache(key) {
  if (!redisAvailable || !redis) return;
  
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Redis DEL error:', error.message);
  }
}

/**
 * Elimina todas las claves que coincidan con un patrón
 * @param {string} pattern - Patrón de claves (ej: "products:*")
 */
export async function invalidatePattern(pattern) {
  if (!redisAvailable || !redis) return;
  
  try {
    // Upstash no soporta SCAN, usamos KEYS con precaución (solo para invalidación)
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️ Cache invalidado: ${keys.length} claves eliminadas`);
    }
  } catch (error) {
    console.error('Redis INVALIDATE error:', error.message);
  }
}

export { redis, redisAvailable };
