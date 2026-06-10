export class CommentResponse {
  id!: string;
  product_id!: string;
  platform!: string;
  video_url?: string;
  author_name?: string;
  content!: string;
  like_count!: number;
  commented_at?: string;
  analysis?: CommentAnalysisResponse;
  created_at!: string;
}

export class CommentAnalysisResponse {
  sentiment!: 'positive' | 'neutral' | 'negative';
  key_topics!: string[];
  pain_points!: string[];
  feature_requests!: string[];
  purchasing_intent!: number;
  confidence!: number;
  analyzed_at!: string;
}

export class CommentListQuery {
  product_id!: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  cursor?: string;
  limit?: number;
}

export class OptimizationRecordResponse {
  id!: string;
  product_id!: string;
  trigger!: string;
  suggestion!: string;
  auto_apply!: boolean;
  status!: string;
  current_script_id?: string;
  optimized_script_id?: string;
  applied_at?: string;
  effect_metrics?: Record<string, unknown>;
  created_at!: string;
}
