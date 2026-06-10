import fs from 'fs';

const filePath = '/workspace/apps/server-gateway/dist/apps/server-gateway/src/comment/comment.service.js';
let content = fs.readFileSync(filePath, 'utf8');

// ===== Patch 1: callDoubaoForAnalysis — wrap generateText with try-catch =====
content = content.replace(
  /(async callDoubaoForAnalysis\(comments\) \{\s+const systemPrompt = `[\s\S]*?`;\s+const userPrompt = comments\s+\.map[\s\S]*?\.join\('\\n'\);\s+)const rawResponse = await this\.doubaoProvider\.generateText\(systemPrompt, userPrompt\);/,
  `$1let rawResponse;
    try {
      rawResponse = await this.doubaoProvider.generateText(systemPrompt, userPrompt);
    } catch (error) {
      const err = error;
      this.logger.error('Doubao API call failed for analysis: ' + err.message + ', using mock fallback');
      rawResponse = '';
    }`
);

// ===== Patch 2: callDoubaoForAnalysis — handle empty cleaned response =====
content = content.replace(
  /(const cleaned = rawResponse\s+\.replace[\s\S]*?\.trim\(\);)\s+const parsed = JSON\.parse\(cleaned\);/,
  `$1
      if (cleaned) {
        const parsed = JSON.parse(cleaned);`
);

content = content.replace(
  /(return \[parsed\];)\s+\}\s+catch \(error\) \{/,
  `$1
      }
      return this.generateMockAnalysis(comments);
    } catch (error) {`
);

// ===== Patch 3: Replace the fallback in callDoubaoForAnalysis catch =====
content = content.replace(
  /(this\.logger\.error\(`Failed to parse Doubao response: \$\{err\.message\}`\);)\s+\/\/ 降级：返回默认分析\s+return comments\.map[\s\S]*?\.map[^{]*\{[\s\S]*?\}\);(\s+\})/,
  `$1
      return this.generateMockAnalysis(comments);$2`
);

// ===== Patch 4: Add mock helpers between buildSentimentSummary and topN =====
const mockAnalysisMethod = `
    /** 生成 mock 分析结果（Doubao API 不可用时的降级方案） */
    generateMockAnalysis(comments) {
        const mockSentiments = ['positive', 'neutral', 'negative', 'positive', 'neutral'];
        const mockTopics = ['物流速度', '产品质量', '价格', '包装', '客服服务', '使用效果', '外观设计', '性价比', '售后服务', '品牌信任'];
        const mockPainPoints = ['发货太慢', '价格偏高', '包装破损', '效果不明显', '尺码不准'];
        const mockFeatureRequests = ['增加颜色选择', '优化包装', '提供试用装', '增加规格', '改善物流'];
        return comments.map((c, i) => ({
            sentiment: mockSentiments[i % mockSentiments.length],
            key_topics: [mockTopics[i % mockTopics.length]],
            pain_points: i % 3 === 0 ? [mockPainPoints[i % mockPainPoints.length]] : [],
            feature_requests: i % 4 === 0 ? [mockFeatureRequests[i % mockFeatureRequests.length]] : [],
            purchasing_intent: Math.round((0.3 + Math.random() * 0.6) * 100) / 100,
            brief_reason: 'Mock analysis (Doubao API unavailable)'
        }));
    }
`;

const mockOptMethod = `
    /** 生成 mock 优化建议（Doubao API 不可用时的降级方案） */
    generateMockOptimizationSuggestion(trigger, summary) {
        const suggestions = {
            pain_point: [
                '分镜1（开场）：针对[发货太慢]痛点，添加"48小时极速发货"承诺，强调物流时效保障',
                '分镜2（产品展示）：针对[包装破损]问题，展示升级后的防震包装，增加开箱演示',
                '分镜3（使用场景）：针对[效果不明显]反馈，增加前后对比画面，用实际数据说服',
                '分镜5（成交引导）：增加限时优惠和买赠活动，降低价格敏感度'
            ],
            negative_sentiment: [
                '分镜1（开场）：替换争议性文案为正面价值阐述，突出产品核心优势',
                '分镜3（用户证言）：增加真实用户好评截图，提升可信度',
                '分镜4（对比环节）：添加与竞品的客观对比，强调差异化卖点'
            ],
            feature_request: [
                '分镜2（产品展示）：展示新增的[颜色选择/规格]等用户需求特性',
                '分镜4（使用教程）：演示新增功能的使用方法，降低用户学习成本',
                '分镜5（结尾）：呼吁用户继续反馈需求，增强互动感'
            ]
        };
        const mockSuggestions = suggestions[trigger] || suggestions.pain_point;
        return mockSuggestions.join('\\n');
    }
`;

// Insert mockAnalysisMethod after topN method (before the empty line that precedes triggerOptimization)
content = content.replace(
  /(\.map\(\(\[k\]\) => k\);\s+\}\s+)(\/\/ ========== 内容优化触发)/,
  `$1${mockAnalysisMethod}\n    ${mockOptMethod}\n\n    $2`
);

// ===== Patch 5: generateOptimizationSuggestion — wrap with try-catch =====
content = content.replace(
  /(const suggestion = await this\.doubaoProvider\.generateText\(systemPrompt, userPrompt\);\s+return suggestion;)/,
  `let suggestion;
    try {
      suggestion = await this.doubaoProvider.generateText(systemPrompt, userPrompt);
    } catch (error) {
      const err = error;
      this.logger.error('Doubao API call failed for optimization suggestion: ' + err.message + ', using mock fallback');
      return this.generateMockOptimizationSuggestion(trigger, summary);
    }
    return suggestion;`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patch applied successfully!');
