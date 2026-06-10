-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('IMAGE', 'VIDEO', 'PRODUCT_MAIN_IMAGE');

-- CreateEnum
CREATE TYPE "MaterialSourceType" AS ENUM ('UPLOAD', 'REFERENCE', 'GENERATED');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MaterialSliceStatus" AS ENUM ('PENDING', 'CAPTIONING', 'EMBEDDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScriptGenerationMode" AS ENUM ('PROMPT_DRIVEN', 'VIRAL_REWRITE', 'TEMPLATE_DRIVEN', 'BATCH', 'COMPOSED', 'HYBRID');

-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('9:16', '16:9');

-- CreateEnum
CREATE TYPE "CameraMovement" AS ENUM ('Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up');

-- CreateEnum
CREATE TYPE "TransitionType" AS ENUM ('None', 'Fade_In', 'Dissolve', 'Wipe');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING', 'PASSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreationStatus" AS ENUM ('PENDING', 'PROCESSING', 'FINISHED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CreationStage" AS ENUM ('QUEUE_ALLOCATION', 'ASSET_MATCHING', 'AI_VIDEO_GENERATING', 'TTS_GENERATING', 'FFMPEG_STITCHING', 'ORIGINALITY_CHECK', 'ORIGINALITY_OPTIMIZE', 'LOUDNORM_COMPLIANCE', 'FINISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShotRenderStatus" AS ENUM ('PENDING', 'PROCESSING', 'FINISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "EngineMode" AS ENUM ('SCRIPT_DRIVEN', 'IMAGE_DRIVEN', 'PROMPT_DRIVEN');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FactorCategory" AS ENUM ('NARRATIVE', 'PARAMETER', 'INSTRUCTION');

-- CreateEnum
CREATE TYPE "ConstraintRuleType" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "OriginalityStatus" AS ENUM ('PENDING', 'PASSED', 'DUPLICATE_DETECTED', 'OPTIMIZED', 'FAILED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "sku_code" VARCHAR(100) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "selling_points" JSONB NOT NULL DEFAULT '[]',
    "target_audience" VARCHAR(200),
    "scenario_tags" JSONB NOT NULL DEFAULT '[]',
    "text_features" JSONB NOT NULL DEFAULT '{}',
    "cover_image_url" VARCHAR(2000),
    "color" VARCHAR(50),
    "material_type" VARCHAR(100),
    "size_desc" VARCHAR(100),
    "usage_scenario" VARCHAR(200),
    "brand" VARCHAR(100),
    "rich_features" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "type" "MaterialType" NOT NULL,
    "source_type" "MaterialSourceType" NOT NULL DEFAULT 'UPLOAD',
    "origin_url" VARCHAR(2000) NOT NULL,
    "thumbnail_url" VARCHAR(2000),
    "file_size_bytes" BIGINT NOT NULL,
    "duration_seconds" DECIMAL(6,2),
    "width" INTEGER,
    "height" INTEGER,
    "mime_type" VARCHAR(100),
    "status" "MaterialStatus" NOT NULL DEFAULT 'PENDING',
    "slices_count" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "summary" TEXT,
    "original_format" VARCHAR(20),
    "copyright_status" VARCHAR(20) NOT NULL DEFAULT 'UNCHECKED',
    "deleted_at" TIMESTAMP(3),
    "referenced_material_id" UUID,
    "reference_category" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_slices" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "slice_id" VARCHAR(64) NOT NULL,
    "start_time" DECIMAL(6,2) NOT NULL,
    "end_time" DECIMAL(6,2) NOT NULL,
    "duration" DECIMAL(5,2) NOT NULL,
    "dense_caption" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "product_dimension_tags" JSONB NOT NULL DEFAULT '[]',
    "video_dimension_tags" JSONB NOT NULL DEFAULT '[]',
    "slice_dimension_tags" JSONB NOT NULL DEFAULT '[]',
    "stream_url" VARCHAR(2000),
    "key_frame_url" VARCHAR(2000),
    "embedding_version" VARCHAR(50),
    "sfx_url" VARCHAR(2000),
    "crop_region_x" INTEGER,
    "crop_region_y" INTEGER,
    "crop_region_w" INTEGER,
    "crop_region_h" INTEGER,
    "status" "MaterialSliceStatus" NOT NULL DEFAULT 'PENDING',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_slices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "title" VARCHAR(200),
    "language" VARCHAR(20) DEFAULT 'zh-CN',
    "target_audience" VARCHAR(200),
    "video_duration" DECIMAL(5,2) NOT NULL,
    "aspectRatio" "AspectRatio" NOT NULL,
    "style_vibe" VARCHAR(100) NOT NULL,
    "generation_mode" "ScriptGenerationMode" NOT NULL,
    "template_id" UUID,
    "viral_video_id" UUID,
    "constraint_list" JSONB NOT NULL DEFAULT '[]',
    "preferences" JSONB,
    "raw_json" JSONB NOT NULL,
    "predicted_ctr" DOUBLE PRECISION,
    "predicted_cvr" DOUBLE PRECISION,
    "predicted_retention" DOUBLE PRECISION,
    "predicted_at" TIMESTAMPTZ,
    "prediction_model" VARCHAR(50),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_shots" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "shot_id" VARCHAR(64),
    "shotIndex" INTEGER NOT NULL,
    "duration" DECIMAL(5,2) NOT NULL,
    "scene_description_query" TEXT NOT NULL,
    "visual_description" TEXT NOT NULL,
    "cameraMovement" "CameraMovement" NOT NULL,
    "transition_type" "TransitionType" NOT NULL,
    "voiceover_text" TEXT NOT NULL,
    "subtitle_text" TEXT NOT NULL,
    "safe_zone_bounding_box" JSONB NOT NULL,
    "selected_slice_id" VARCHAR(64),
    "render_prompt" TEXT,
    "local_factor_patch" JSONB NOT NULL DEFAULT '{}',
    "bgm_segment" JSONB,
    "compliance_status" "ComplianceStatus" NOT NULL DEFAULT 'PENDING',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "script_shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "task_id" VARCHAR(64) NOT NULL,
    "engine_mode" "EngineMode" NOT NULL DEFAULT 'SCRIPT_DRIVEN',
    "target_resolution" VARCHAR(20) NOT NULL DEFAULT '1080x1920',
    "export_format" VARCHAR(10) NOT NULL DEFAULT 'MP4',
    "status" "CreationStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "current_stage" "CreationStage" NOT NULL DEFAULT 'QUEUE_ALLOCATION',
    "video_url" VARCHAR(2000),
    "file_size_bytes" BIGINT,
    "trace_id" VARCHAR(64),
    "prefer_ai_video" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "watermark_config" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_renders" (
    "id" UUID NOT NULL,
    "creation_id" UUID NOT NULL,
    "script_shot_id" UUID NOT NULL,
    "shot_id" VARCHAR(64),
    "shotIndex" INTEGER NOT NULL,
    "cache_hash" VARCHAR(64),
    "slice_id" VARCHAR(64),
    "render_path" VARCHAR(2000),
    "render_duration_ms" INTEGER,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(32),
    "seedance_prompt" TEXT,
    "status" "ShotRenderStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shot_renders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "strategy_summary" TEXT NOT NULL,
    "factor_json" JSONB NOT NULL,
    "schema_json" JSONB,
    "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_viral_videos" (
    "template_id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_viral_videos_pkey" PRIMARY KEY ("template_id","analysis_id")
);

-- CreateTable
CREATE TABLE "factors" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" "FactorCategory" NOT NULL DEFAULT 'PARAMETER',
    "description" TEXT,
    "default_value" JSONB,
    "value_schema" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_factors" (
    "template_id" UUID NOT NULL,
    "factor_id" UUID NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "template_factors_pkey" PRIMARY KEY ("template_id","factor_id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(60) NOT NULL,
    "summary" TEXT NOT NULL,
    "summary_json" JSONB,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constraints" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(60) NOT NULL,
    "rule_type" "ConstraintRuleType" NOT NULL,
    "rule_config" JSONB NOT NULL,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_strategies" (
    "template_id" UUID NOT NULL,
    "strategy_id" UUID NOT NULL,

    CONSTRAINT "template_strategies_pkey" PRIMARY KEY ("template_id","strategy_id")
);

-- CreateTable
CREATE TABLE "template_constraints" (
    "template_id" UUID NOT NULL,
    "constraint_id" UUID NOT NULL,

    CONSTRAINT "template_constraints_pkey" PRIMARY KEY ("template_id","constraint_id")
);

-- CreateTable
CREATE TABLE "viral_video_analyses" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "source_platform" VARCHAR(50) NOT NULL,
    "source_url" VARCHAR(2000) NOT NULL,
    "external_video_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255),
    "hook_type" VARCHAR(100),
    "strategy_json" JSONB NOT NULL,
    "factor_json" JSONB NOT NULL,
    "report_json" JSONB NOT NULL,
    "selling_points" JSONB,
    "shots_decomposition" JSONB,
    "declared_public_source" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viral_video_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_search_logs" (
    "id" UUID NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "user_id" VARCHAR(100),
    "source" VARCHAR(50) NOT NULL DEFAULT 'material_search',
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_versions" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "trigger_action" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "script_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creation_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "product_id" UUID,
    "script_id" UUID NOT NULL,
    "preset_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dna_patterns" (
    "id" UUID NOT NULL,
    "product_category" VARCHAR(50) NOT NULL,
    "market" VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
    "dna_json" JSONB NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dna_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_ab_sessions" (
    "id" UUID NOT NULL,
    "base_script_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "variant_configs" JSONB NOT NULL,
    "variant_script_ids" JSONB,
    "variant_creation_ids" JSONB,
    "result_json" JSONB,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "auto_ab_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "user_prompt" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viral_subscriptions" (
    "id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "account_url" VARCHAR(500) NOT NULL,
    "account_name" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_checked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "viral_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "trends_json" JSONB NOT NULL,
    "recommendations_json" JSONB NOT NULL,
    "generated_by" VARCHAR(50) NOT NULL DEFAULT 'AI',
    "ttl_seconds" INTEGER NOT NULL DEFAULT 3600,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtitle_translations" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "shot_index" INTEGER NOT NULL,
    "source_lang" VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
    "source_text" TEXT NOT NULL,
    "target_lang" VARCHAR(10) NOT NULL,
    "translated_text" TEXT NOT NULL,
    "cultural_notes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subtitle_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL DEFAULT 'tiktok',
    "external_id" VARCHAR(255) NOT NULL,
    "video_url" VARCHAR(500),
    "author_name" VARCHAR(200),
    "content" TEXT NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "commented_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_analyses" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "sentiment" VARCHAR(20) NOT NULL,
    "key_topics" JSONB NOT NULL DEFAULT '[]',
    "pain_points" JSONB NOT NULL DEFAULT '[]',
    "feature_requests" JSONB NOT NULL DEFAULT '[]',
    "purchasing_intent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "raw_analysis" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "analyzed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_used" VARCHAR(100),

    CONSTRAINT "comment_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_optimizations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "trigger" VARCHAR(50) NOT NULL,
    "source_analysis_id" UUID,
    "current_script_id" UUID,
    "optimized_script_id" UUID,
    "trigger_detail" JSONB NOT NULL,
    "suggestion" TEXT NOT NULL,
    "auto_apply" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "applied_at" TIMESTAMPTZ,
    "applied_by" VARCHAR(50),
    "effect_metrics" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "content_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "originality_checks" (
    "id" UUID NOT NULL,
    "creation_id" UUID NOT NULL,
    "score_before" DOUBLE PRECISION NOT NULL,
    "score_after" DOUBLE PRECISION,
    "similar_videos" JSONB NOT NULL DEFAULT '[]',
    "duplicate_sections" JSONB NOT NULL DEFAULT '[]',
    "optimization_suggestions" JSONB NOT NULL DEFAULT '[]',
    "status" "OriginalityStatus" NOT NULL DEFAULT 'PENDING',
    "remark" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "originality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autocut_jobs" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "material_name" VARCHAR(255),
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "stage" VARCHAR(50),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "segments" JSONB,
    "srt_content" TEXT,
    "language" VARCHAR(20),
    "video_duration" DOUBLE PRECISION,
    "output_url" VARCHAR(2000),
    "output_duration" DOUBLE PRECISION,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "autocut_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_code_key" ON "products"("sku_code");

-- CreateIndex
CREATE INDEX "products_title_idx" ON "products"("title");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- CreateIndex
CREATE INDEX "materials_product_id_idx" ON "materials"("product_id");

-- CreateIndex
CREATE INDEX "materials_type_idx" ON "materials"("type");

-- CreateIndex
CREATE INDEX "materials_status_idx" ON "materials"("status");

-- CreateIndex
CREATE INDEX "materials_source_type_idx" ON "materials"("source_type");

-- CreateIndex
CREATE INDEX "materials_duration_seconds_idx" ON "materials"("duration_seconds");

-- CreateIndex
CREATE INDEX "materials_created_at_idx" ON "materials"("created_at");

-- CreateIndex
CREATE INDEX "materials_deleted_at_idx" ON "materials"("deleted_at");

-- CreateIndex
CREATE INDEX "materials_referenced_material_id_idx" ON "materials"("referenced_material_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_slices_slice_id_key" ON "material_slices"("slice_id");

-- CreateIndex
CREATE INDEX "material_slices_material_id_idx" ON "material_slices"("material_id");

-- CreateIndex
CREATE INDEX "material_slices_duration_idx" ON "material_slices"("duration");

-- CreateIndex
CREATE INDEX "material_slices_status_idx" ON "material_slices"("status");

-- CreateIndex
CREATE INDEX "material_slices_created_at_idx" ON "material_slices"("created_at");

-- CreateIndex
CREATE INDEX "material_slices_deleted_at_idx" ON "material_slices"("deleted_at");

-- CreateIndex
CREATE INDEX "scripts_product_id_idx" ON "scripts"("product_id");

-- CreateIndex
CREATE INDEX "scripts_title_idx" ON "scripts"("title");

-- CreateIndex
CREATE INDEX "scripts_generation_mode_idx" ON "scripts"("generation_mode");

-- CreateIndex
CREATE INDEX "scripts_created_at_idx" ON "scripts"("created_at");

-- CreateIndex
CREATE INDEX "scripts_deleted_at_idx" ON "scripts"("deleted_at");

-- CreateIndex
CREATE INDEX "script_shots_script_id_idx" ON "script_shots"("script_id");

-- CreateIndex
CREATE INDEX "script_shots_selected_slice_id_idx" ON "script_shots"("selected_slice_id");

-- CreateIndex
CREATE INDEX "script_shots_compliance_status_idx" ON "script_shots"("compliance_status");

-- CreateIndex
CREATE INDEX "script_shots_created_at_idx" ON "script_shots"("created_at");

-- CreateIndex
CREATE INDEX "script_shots_deleted_at_idx" ON "script_shots"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "script_shots_script_id_shotIndex_key" ON "script_shots"("script_id", "shotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "creations_task_id_key" ON "creations"("task_id");

-- CreateIndex
CREATE INDEX "creations_product_id_idx" ON "creations"("product_id");

-- CreateIndex
CREATE INDEX "creations_script_id_idx" ON "creations"("script_id");

-- CreateIndex
CREATE INDEX "creations_status_idx" ON "creations"("status");

-- CreateIndex
CREATE INDEX "creations_current_stage_idx" ON "creations"("current_stage");

-- CreateIndex
CREATE INDEX "creations_trace_id_idx" ON "creations"("trace_id");

-- CreateIndex
CREATE INDEX "creations_started_at_idx" ON "creations"("started_at");

-- CreateIndex
CREATE INDEX "creations_finished_at_idx" ON "creations"("finished_at");

-- CreateIndex
CREATE INDEX "creations_created_at_idx" ON "creations"("created_at");

-- CreateIndex
CREATE INDEX "creations_deleted_at_idx" ON "creations"("deleted_at");

-- CreateIndex
CREATE INDEX "creations_status_deleted_at_idx" ON "creations"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "shot_renders_creation_id_idx" ON "shot_renders"("creation_id");

-- CreateIndex
CREATE INDEX "shot_renders_script_shot_id_idx" ON "shot_renders"("script_shot_id");

-- CreateIndex
CREATE INDEX "shot_renders_cache_hash_idx" ON "shot_renders"("cache_hash");

-- CreateIndex
CREATE INDEX "shot_renders_slice_id_idx" ON "shot_renders"("slice_id");

-- CreateIndex
CREATE INDEX "shot_renders_status_idx" ON "shot_renders"("status");

-- CreateIndex
CREATE INDEX "shot_renders_created_at_idx" ON "shot_renders"("created_at");

-- CreateIndex
CREATE INDEX "templates_product_id_idx" ON "templates"("product_id");

-- CreateIndex
CREATE INDEX "templates_name_idx" ON "templates"("name");

-- CreateIndex
CREATE INDEX "templates_category_idx" ON "templates"("category");

-- CreateIndex
CREATE INDEX "templates_status_idx" ON "templates"("status");

-- CreateIndex
CREATE INDEX "templates_created_at_idx" ON "templates"("created_at");

-- CreateIndex
CREATE INDEX "template_viral_videos_analysis_id_idx" ON "template_viral_videos"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "factors_key_key" ON "factors"("key");

-- CreateIndex
CREATE INDEX "factors_category_idx" ON "factors"("category");

-- CreateIndex
CREATE INDEX "factors_key_idx" ON "factors"("key");

-- CreateIndex
CREATE INDEX "factors_sort_order_idx" ON "factors"("sort_order");

-- CreateIndex
CREATE INDEX "template_factors_factor_id_idx" ON "template_factors"("factor_id");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_key_key" ON "strategies"("key");

-- CreateIndex
CREATE INDEX "strategies_key_idx" ON "strategies"("key");

-- CreateIndex
CREATE INDEX "strategies_category_idx" ON "strategies"("category");

-- CreateIndex
CREATE INDEX "strategies_sort_order_idx" ON "strategies"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "constraints_key_key" ON "constraints"("key");

-- CreateIndex
CREATE INDEX "constraints_key_idx" ON "constraints"("key");

-- CreateIndex
CREATE INDEX "constraints_category_idx" ON "constraints"("category");

-- CreateIndex
CREATE INDEX "constraints_rule_type_idx" ON "constraints"("rule_type");

-- CreateIndex
CREATE INDEX "constraints_sort_order_idx" ON "constraints"("sort_order");

-- CreateIndex
CREATE INDEX "template_strategies_strategy_id_idx" ON "template_strategies"("strategy_id");

-- CreateIndex
CREATE INDEX "template_constraints_constraint_id_idx" ON "template_constraints"("constraint_id");

-- CreateIndex
CREATE INDEX "viral_video_analyses_product_id_idx" ON "viral_video_analyses"("product_id");

-- CreateIndex
CREATE INDEX "viral_video_analyses_source_platform_idx" ON "viral_video_analyses"("source_platform");

-- CreateIndex
CREATE INDEX "viral_video_analyses_external_video_id_idx" ON "viral_video_analyses"("external_video_id");

-- CreateIndex
CREATE INDEX "viral_video_analyses_created_at_idx" ON "viral_video_analyses"("created_at");

-- CreateIndex
CREATE INDEX "user_search_logs_created_at_idx" ON "user_search_logs"("created_at");

-- CreateIndex
CREATE INDEX "user_search_logs_query_idx" ON "user_search_logs"("query");

-- CreateIndex
CREATE INDEX "script_versions_script_id_created_at_idx" ON "script_versions"("script_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "script_versions_script_id_version_number_key" ON "script_versions"("script_id", "version_number");

-- CreateIndex
CREATE INDEX "creation_templates_product_id_idx" ON "creation_templates"("product_id");

-- CreateIndex
CREATE INDEX "creation_templates_script_id_idx" ON "creation_templates"("script_id");

-- CreateIndex
CREATE INDEX "dna_patterns_product_category_idx" ON "dna_patterns"("product_category");

-- CreateIndex
CREATE INDEX "dna_patterns_confidence_idx" ON "dna_patterns"("confidence");

-- CreateIndex
CREATE INDEX "auto_ab_sessions_base_script_id_idx" ON "auto_ab_sessions"("base_script_id");

-- CreateIndex
CREATE INDEX "auto_ab_sessions_status_idx" ON "auto_ab_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_template_versions_template_id_version_number_key" ON "prompt_template_versions"("template_id", "version_number");

-- CreateIndex
CREATE INDEX "trend_snapshots_product_id_idx" ON "trend_snapshots"("product_id");

-- CreateIndex
CREATE INDEX "trend_snapshots_expires_at_idx" ON "trend_snapshots"("expires_at");

-- CreateIndex
CREATE INDEX "trend_snapshots_created_at_idx" ON "trend_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "subtitle_translations_script_id_idx" ON "subtitle_translations"("script_id");

-- CreateIndex
CREATE UNIQUE INDEX "subtitle_translations_script_id_shot_index_target_lang_key" ON "subtitle_translations"("script_id", "shot_index", "target_lang");

-- CreateIndex
CREATE INDEX "comments_product_id_idx" ON "comments"("product_id");

-- CreateIndex
CREATE INDEX "comments_commented_at_idx" ON "comments"("commented_at");

-- CreateIndex
CREATE UNIQUE INDEX "comments_platform_external_id_key" ON "comments"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "comment_analyses_comment_id_key" ON "comment_analyses"("comment_id");

-- CreateIndex
CREATE INDEX "comment_analyses_sentiment_idx" ON "comment_analyses"("sentiment");

-- CreateIndex
CREATE INDEX "content_optimizations_product_id_idx" ON "content_optimizations"("product_id");

-- CreateIndex
CREATE INDEX "content_optimizations_status_idx" ON "content_optimizations"("status");

-- CreateIndex
CREATE INDEX "content_optimizations_trigger_idx" ON "content_optimizations"("trigger");

-- CreateIndex
CREATE INDEX "originality_checks_creation_id_idx" ON "originality_checks"("creation_id");

-- CreateIndex
CREATE INDEX "originality_checks_status_idx" ON "originality_checks"("status");

-- CreateIndex
CREATE INDEX "originality_checks_created_at_idx" ON "originality_checks"("created_at" DESC);

-- CreateIndex
CREATE INDEX "autocut_jobs_material_id_idx" ON "autocut_jobs"("material_id");

-- CreateIndex
CREATE INDEX "autocut_jobs_status_idx" ON "autocut_jobs"("status");

-- CreateIndex
CREATE INDEX "autocut_jobs_created_at_idx" ON "autocut_jobs"("created_at");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_referenced_material_id_fkey" FOREIGN KEY ("referenced_material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_slices" ADD CONSTRAINT "material_slices_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_viral_video_id_fkey" FOREIGN KEY ("viral_video_id") REFERENCES "viral_video_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_shots" ADD CONSTRAINT "script_shots_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creations" ADD CONSTRAINT "creations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creations" ADD CONSTRAINT "creations_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_renders" ADD CONSTRAINT "shot_renders_creation_id_fkey" FOREIGN KEY ("creation_id") REFERENCES "creations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_renders" ADD CONSTRAINT "shot_renders_script_shot_id_fkey" FOREIGN KEY ("script_shot_id") REFERENCES "script_shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_viral_videos" ADD CONSTRAINT "template_viral_videos_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_viral_videos" ADD CONSTRAINT "template_viral_videos_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "viral_video_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_factors" ADD CONSTRAINT "template_factors_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_factors" ADD CONSTRAINT "template_factors_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "factors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_strategies" ADD CONSTRAINT "template_strategies_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_strategies" ADD CONSTRAINT "template_strategies_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_constraints" ADD CONSTRAINT "template_constraints_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_constraints" ADD CONSTRAINT "template_constraints_constraint_id_fkey" FOREIGN KEY ("constraint_id") REFERENCES "constraints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viral_video_analyses" ADD CONSTRAINT "viral_video_analyses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "prompt_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitle_translations" ADD CONSTRAINT "subtitle_translations_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_analyses" ADD CONSTRAINT "comment_analyses_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_optimizations" ADD CONSTRAINT "content_optimizations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "originality_checks" ADD CONSTRAINT "originality_checks_creation_id_fkey" FOREIGN KEY ("creation_id") REFERENCES "creations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
