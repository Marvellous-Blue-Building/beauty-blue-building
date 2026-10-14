-- Bulk-import data/beauty_product.csv into `products` via a staging table
-- (fast native COPY, then a single transforming INSERT).

DROP TABLE IF EXISTS staging_beauty_products;

CREATE TEMP TABLE staging_beauty_products (
  product_sku TEXT,
  name TEXT,
  price TEXT,
  listed_price TEXT,
  stock_quantity TEXT,
  short_description TEXT,
  category TEXT,
  sub_category TEXT,
  segment TEXT,
  category_path TEXT,
  parent_sku TEXT,
  image_url TEXT,
  product_url TEXT,
  brand TEXT,
  bundle_derived_color_varian TEXT,
  color_varian TEXT,
  rating TEXT,
  short_ingredients TEXT,
  short_usage TEXT,
  total_review TEXT,
  variant_color_name TEXT,
  weight_gram TEXT
);

\copy staging_beauty_products FROM '/tmp/beauty_product.csv' WITH (FORMAT csv, HEADER true)

INSERT INTO products (
  sku, name, brand, description, price, listed_price, stock_quantity,
  category, parent_sku, image_url, product_url, color_variant,
  variant_color_name, rating, total_review, ingredients,
  usage_instructions, size_label
)
SELECT
  product_sku,
  name,
  brand,
  NULLIF(short_description, ''),
  price::NUMERIC(10,2),
  NULLIF(listed_price, '')::NUMERIC(12,2),
  NULLIF(stock_quantity, '')::INTEGER,
  NULLIF(category, ''),
  NULLIF(parent_sku, ''),
  NULLIF(image_url, ''),
  NULLIF(product_url, ''),
  NULLIF(color_varian, ''),
  NULLIF(variant_color_name, ''),
  NULLIF(replace(rating, ',', '.'), '')::NUMERIC(2,1),
  NULLIF(total_review, '')::INTEGER,
  NULLIF(short_ingredients, ''),
  NULLIF(short_usage, ''),
  NULLIF(weight_gram, '')
FROM staging_beauty_products
ON CONFLICT (sku) DO NOTHING;

DROP TABLE staging_beauty_products;
