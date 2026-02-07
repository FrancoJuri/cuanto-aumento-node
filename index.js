import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Configurar variables de entorno (antes de cualquier import que los use)
dotenv.config();

// Importar config (esto inicializa Redis con logs)
import './config/redis.js';

// Importar rutas de la API
import productRoutes from './routes/productRoutes.js';

import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet()); 
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN,
  optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

// Rate Limiting: Máximo 300 peticiones por 15 minutos
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // Límite de 300 peticiones por IP por ventana
  standardHeaders: true, // Devuelve info de límites en los headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
  message: {
    error: 'Too Many Requests',
    message: 'Has excedido el límite de peticiones. Por favor intenta más tarde.',
  },
});

app.use(limiter);

// ============================================
// 🚀 API ROUTES
// ============================================
app.use('/api', productRoutes);

// ============================================
// 📊 INFO ROUTES
// ============================================

// Ruta básica de información
app.get('/', (req, res) => {
  res.json({
    message: '🛒 Cuanto Aumento - API de Precios de Supermercados',
    description: 'API para consultar productos y precios históricos',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/products - Lista paginada de productos con precios',
      'GET /api/products/search?q=... - Buscar productos',
      'GET /api/products/category/:category - Productos por categoría',
      'GET /api/products/:ean - Detalle con historial de precios',
      'GET /api/products/:ean/cheapest - Supermercado más barato',
      'GET /api/categories - Lista de categorías',
      'GET /api/stats/categories - Estadísticas por categoría',
    ],
  });
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// ❌ ERROR HANDLING
// ============================================

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.originalUrl} no existe`,
    hint: 'Visita GET / para ver los endpoints disponibles',
  });
});

// Manejo de errores globales
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: error.message,
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📦 API Principal: GET /api/products`);
  console.log(`🔍 Búsqueda: GET /api/products/search?q=...`);
  console.log(`📊 Categorías: GET /api/categories\n`);
});

