# Proyecto: Cuánto Aumento (Historical Supermarket Prices)

## Objetivo
El objetivo principal es construir una base de datos histórica de precios de productos de supermercados en Argentina. Esto permitirá:
- Comparar precios actuales e históricos.
- Medir la inflación de productos específicos.
- Generar gráficos comparativos entre distintos supermercados (ej. Disco, Coto, Carrefour).

## Arquitectura Técnica
- **Lenguaje de Scraping**: Node.js.
- **Base de Datos**: Supabase (PostgreSQL).
- **Frontend**: (Pendiente) Interfaz para visualización de datos y gráficos.

## Estrategia de Datos
Para evitar duplicados y mantener una base de datos limpia, se sigue la siguiente lógica:

1.  **Catálogo Maestro (Disco)**: Se utiliza al supermercado **Disco** como referencia principal para crear los productos en la base de datos, ya que provee buena información (descripciones, imágenes, etc.).
2.  **Unificación por EAN**: La clave principal para identificar un producto es su código de barras (EAN).
3.  **Flujo de Guardado**:
    - Al scrapear un producto, se busca su EAN en la tabla `products`.
    - **Si el EAN existe**: Se inserta un nuevo registro en la tabla `prices` con el precio actual y el ID del supermercado correspondiente.
    - **Si el EAN NO existe**:
        - Si el origen es el "Master" (Disco), se crea el producto en la tabla `products` con todos sus detalles (nombre, descripción, marca, imagen) y luego se inserta el precio.
        - (A definir: manejo de productos nuevos de otros supermercados que no están en el master).

## Estructura de Base de Datos (Supabase)

### 1. `supermarkets`
Almacena las cadenas de supermercados monitoreadas.
- `id`: Identificador único (BigInt).
- `name`: Nombre (ej. "Disco", "Coto").

### 2. `products`
Catálogo único de productos, normalizado por EAN.
- `ean`: Clave Primaria (Texto). Código de barras.
- `name`: Nombre del producto.
- `description`: Descripción detallada (para mostrar en frontend).
- `brand`: Marca del producto.
- `category`: Categoría.
- `image_url`: URL de la imagen del producto.

### 3. `prices`
Historial de precios. Cada fila es una "foto" del precio de un producto en un super en un momento dado.
- `id`: Clave Primaria.
- `product_ean`: FK a `products.ean`.
- `supermarket_id`: FK a `supermarkets.id`.
- `price`: Valor numérico del precio.
- `scraped_at`: Fecha y hora del relevamiento.

## Estado del Proyecto
- **Base de Datos**: Esquema implementado en Supabase.
- **Scrapers**: Scripts en Node.js existentes (funcionan bien, requieren integración con la nueva DB).
- **Próximos Pasos**: Integrar los scrapers para poblar la base de datos y comenzar el desarrollo del frontend.
