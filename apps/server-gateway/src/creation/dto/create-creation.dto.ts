// =============================================================================
// TikStream AI — Creation DTO
// =============================================================================

import { IsUUID, IsString, IsOptional, IsIn, IsBoolean, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CREATION_CONSTANTS } from '../creation.constants';

export class CreateCreationDto {
  @ApiProperty({
    description: '商品 ID (UUIDv4)',
    example: '00000000-0000-4000-a000-000000000001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'product_id 必须是有效的 UUIDv4' })
  product_id!: string;

  @ApiPropertyOptional({
    description: '剧本 ID (UUIDv4)。SCRIPT_DRIVEN 模式必填；IMAGE_DRIVEN/PROMPT_DRIVEN 模式下可选(自动生成)',
    example: '00000000-0000-4000-a000-000000000050',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'script_id 必须是有效的 UUIDv4' })
  script_id?: string;

  @ApiPropertyOptional({
    description: '引擎模式',
    default: 'SCRIPT_DRIVEN',
    enum: ['SCRIPT_DRIVEN', 'IMAGE_DRIVEN', 'PROMPT_DRIVEN'],
  })
  @IsOptional()
  @IsIn(['SCRIPT_DRIVEN', 'IMAGE_DRIVEN', 'PROMPT_DRIVEN'], {
    message: 'engine_mode 必须是 SCRIPT_DRIVEN/IMAGE_DRIVEN/PROMPT_DRIVEN',
  })
  engine_mode?: string;

  @ApiPropertyOptional({
    description: '目标分辨率',
    default: '1080x1920',
    enum: ['1080x1920', '1920x1080', '720x1280'],
  })
  @IsOptional()
  @IsIn(['1080x1920', '1920x1080', '720x1280'], { message: 'target_resolution 必须是 1080x1920/1920x1080/720x1280' })
  target_resolution?: string;

  @ApiPropertyOptional({
    description: '导出格式',
    default: 'MP4',
    enum: ['MP4', 'MOV', 'WEBM'],
  })
  @IsOptional()
  @IsIn(['MP4', 'MOV', 'WEBM'], { message: 'export_format 必须是 MP4/MOV/WEBM' })
  export_format?: string;

  @ApiPropertyOptional({
    description: '旁白语音配置',
    default: 'default_female_zh',
    example: 'male_anchor_en',
  })
  @IsOptional()
  @IsString({ message: 'voice_profile 必须是字符串' })
  @MaxLength(CREATION_CONSTANTS.MAX_VOICE_PROFILE_LENGTH, {
    message: `voice_profile 长度不能超过 ${CREATION_CONSTANTS.MAX_VOICE_PROFILE_LENGTH} 字符`,
  })
  voice_profile?: string;

  @ApiPropertyOptional({
    description: 'BGM 来源策略',
    default: 'auto_match',
    examples: ['auto_match', 'manual_select'],
  })
  @IsOptional()
  @IsString({ message: 'bgm_policy 必须是字符串' })
  @MaxLength(CREATION_CONSTANTS.MAX_BGM_POLICY_LENGTH, {
    message: `bgm_policy 长度不能超过 ${CREATION_CONSTANTS.MAX_BGM_POLICY_LENGTH} 字符`,
  })
  bgm_policy?: string;

  @ApiPropertyOptional({
    description: '强制刷新：即使缓存命中也重新生成所有分镜画面',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'force_refresh 必须是布尔值' })
  force_refresh?: boolean;

  @ApiPropertyOptional({
    description: '优先 AI 图生视频：跳过素材切片绑定，所有分镜走 Seedance',
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'prefer_ai_video 必须是布尔值' })
  prefer_ai_video?: boolean;

  // ---- IMAGE_DRIVEN 模式专用 ----
  @ApiPropertyOptional({
    description: 'PRODUCT_MAIN_IMAGE 素材 UUID（IMAGE_DRIVEN 模式必填）',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'material_id 必须是有效的 UUIDv4' })
  material_id?: string;

  @ApiPropertyOptional({
    description: '自动生成剧本时的风格调性',
    example: 'professional',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CREATION_CONSTANTS.MAX_STYLE_VIBE_LENGTH, {
    message: `style_vibe 长度不能超过 ${CREATION_CONSTANTS.MAX_STYLE_VIBE_LENGTH} 字符`,
  })
  style_vibe?: string;

  @ApiPropertyOptional({
    description: '自动生成剧本时的画幅比例',
    default: '9:16',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CREATION_CONSTANTS.MAX_ASPECT_RATIO_LENGTH, {
    message: `aspect_ratio 长度不能超过 ${CREATION_CONSTANTS.MAX_ASPECT_RATIO_LENGTH} 字符`,
  })
  aspect_ratio?: string;

  // ---- PROMPT_DRIVEN 模式专用 ----
  @ApiPropertyOptional({
    description: '商品链接 URL（AI 解析为结构化 Product 信息）',
    example: 'https://www.amazon.com/dp/B0XXXXXXX',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CREATION_CONSTANTS.MAX_PRODUCT_URL_LENGTH, {
    message: `product_url 长度不能超过 ${CREATION_CONSTANTS.MAX_PRODUCT_URL_LENGTH} 字符`,
  })
  product_url?: string;

  @ApiPropertyOptional({
    description: '商品标题（手动输入，可选）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CREATION_CONSTANTS.MAX_PRODUCT_TITLE_LENGTH, {
    message: `product_title 长度不能超过 ${CREATION_CONSTANTS.MAX_PRODUCT_TITLE_LENGTH} 字符`,
  })
  product_title?: string;

  @ApiPropertyOptional({
    description: '商品卖点列表',
  })
  @IsOptional()
  @IsArray()
  product_selling_points?: string[];

  @ApiPropertyOptional({
    description: '商品类目',
    example: 'Electronics',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CREATION_CONSTANTS.MAX_PRODUCT_CATEGORY_LENGTH, {
    message: `product_category 长度不能超过 ${CREATION_CONSTANTS.MAX_PRODUCT_CATEGORY_LENGTH} 字符`,
  })
  product_category?: string;

  // ---- 素材关联（所有模式可选，SCRIPT_DRIVEN 下推荐） ----
  @ApiPropertyOptional({
    description: '分镜→素材切片绑定映射。key=shot_index (0-based), value=slice_id。指定后跳过自动匹配',
    example: { "0": "00000000-0000-0000-0000-000000000100" },
  })
  @IsOptional()
  shot_slice_bindings?: Record<number, string>;

  @ApiPropertyOptional({
    description: '素材 UUID 列表（用于限定自动匹配候选池，不传则全局搜索）',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  preferred_material_ids?: string[];

  @ApiPropertyOptional({
    description: '素材匹配策略',
    default: 'AUTO',
    enum: ['AUTO', 'MANUAL', 'AUTO_WITH_PREFERRED'],
  })
  @IsOptional()
  @IsIn(['AUTO', 'MANUAL', 'AUTO_WITH_PREFERRED'], {
    message: 'slice_match_strategy 必须是 AUTO/MANUAL/AUTO_WITH_PREFERRED',
  })
  slice_match_strategy?: string;
}
