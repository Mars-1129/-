-- 1080P投影仪：0 FINISHED → 把2个 PROCESSING 改为 FINISHED
WITH ranked AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM creations c
  JOIN scripts s ON s.id = c.script_id AND s.deleted_at IS NULL
  WHERE c.deleted_at IS NULL AND s.product_id = 'd7205a41-9e64-4eef-be1a-a3f417fb294f' AND c.status = 'PROCESSING'
)
UPDATE creations SET status = 'FINISHED', updated_at = NOW(), finished_at = NOW()
FROM ranked WHERE creations.id = ranked.id AND ranked.rn <= 2;

-- 便携蓝牙音箱 防水低音炮：1 FINISHED → 把1个 FAILED 改为 FINISHED
WITH ranked AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM creations c
  JOIN scripts s ON s.id = c.script_id AND s.deleted_at IS NULL
  WHERE c.deleted_at IS NULL AND s.product_id = '7f749ff2-8ef4-4472-a2d6-4e20858d08a8' AND c.status = 'FAILED'
)
UPDATE creations SET status = 'FINISHED', updated_at = NOW(), finished_at = NOW()
FROM ranked WHERE creations.id = ranked.id AND ranked.rn <= 1;

-- 无线降噪耳机 Pro Max：1 FINISHED → 把1个 PROCESSING 改为 FINISHED
WITH ranked AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM creations c
  JOIN scripts s ON s.id = c.script_id AND s.deleted_at IS NULL
  WHERE c.deleted_at IS NULL AND s.product_id = '2ac3ff48-0e76-4cda-9994-27fe5b6f8565' AND c.status = 'PROCESSING'
)
UPDATE creations SET status = 'FINISHED', updated_at = NOW(), finished_at = NOW()
FROM ranked WHERE creations.id = ranked.id AND ranked.rn <= 1;

-- 轻薄羽绒马甲 可收纳：1 FINISHED → 把1个 PROCESSING 改为 FINISHED
WITH ranked AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM creations c
  JOIN scripts s ON s.id = c.script_id AND s.deleted_at IS NULL
  WHERE c.deleted_at IS NULL AND s.product_id = '39abd988-be83-4fb4-a335-2e49aa30d5d1' AND c.status = 'PROCESSING'
)
UPDATE creations SET status = 'FINISHED', updated_at = NOW(), finished_at = NOW()
FROM ranked WHERE creations.id = ranked.id AND ranked.rn <= 1;

-- 维生素C泡腾片 香橙味 20粒：1 FINISHED → 把1个 PROCESSING 改为 FINISHED
WITH ranked AS (
  SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.created_at) AS rn
  FROM creations c
  JOIN scripts s ON s.id = c.script_id AND s.deleted_at IS NULL
  WHERE c.deleted_at IS NULL AND s.product_id = '6db1051c-106a-4c4a-b30d-d733b6a51003' AND c.status = 'PROCESSING'
)
UPDATE creations SET status = 'FINISHED', updated_at = NOW(), finished_at = NOW()
FROM ranked WHERE creations.id = ranked.id AND ranked.rn <= 1;
