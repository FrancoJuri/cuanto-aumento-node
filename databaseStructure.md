### 3. Estructura de Base de Datos (Supabase)
Necesitas un modelo relacional para evitar duplicados y permitir el histórico.

**Tabla `products` (Catálogo Único)**
*   `ean` (PK o índice único): 779123456789
*   `name`: "Arroz Gallo Oro 1kg" (Nombre normalizado)
*   `image_url`: URL de la foto
*   `brand`: "Gallo"

**Tabla `supermarkets`**
*   `id`: 1, 2...
*   `name`: "Carrefour", "Disco", "Coto"

**Tabla `prices` (Historial)**
*   `id`: PK
*   `product_ean`: FK a products.ean
*   `supermarket_id`: FK a supermarkets.id
*   `price`: 1500.00
*   `date`: 2023-11-22 (Fecha del scrapeo)