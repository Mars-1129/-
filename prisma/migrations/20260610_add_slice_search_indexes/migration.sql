-- =============================================================================
-- Phase 3 索引优化: 切片搜索加速
-- =============================================================================

-- 1. pg_trgm 扩展 (三元组模糊匹配)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2-8. 用 DO 块逐条判断索引是否存在，避免重复创建报错
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_slices_tags_gin') THEN
    CREATE INDEX idx_slices_tags_gin ON material_slices USING GIN (tags jsonb_path_ops);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_slices_caption_trgm') THEN
    CREATE INDEX idx_slices_caption_trgm ON material_slices USING GIN (dense_caption gin_trgm_ops);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_slices_product_dim_tags_gin') THEN
    CREATE INDEX idx_slices_product_dim_tags_gin ON material_slices USING GIN (product_dimension_tags jsonb_path_ops);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_slices_video_dim_tags_gin') THEN
    CREATE INDEX idx_slices_video_dim_tags_gin ON material_slices USING GIN (video_dimension_tags jsonb_path_ops);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_slices_slice_dim_tags_gin') THEN
    CREATE INDEX idx_slices_slice_dim_tags_gin ON material_slices USING GIN (slice_dimension_tags jsonb_path_ops);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_materials_product_status_type') THEN
    CREATE INDEX idx_materials_product_status_type ON materials(product_id, status, type, deleted_at) WHERE deleted_at IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_materials_summary_trgm') THEN
    CREATE INDEX idx_materials_summary_trgm ON materials USING GIN (summary gin_trgm_ops) WHERE summary IS NOT NULL;
  END IF;
END $$;
