// =============================================================================
// TikStream AI — Backend i18n Error Messages
// =============================================================================

export const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  'zh-CN': {
    SCRIPT_NOT_FOUND: '剧本不存在',
    CREATION_NOT_FOUND: '创作任务不存在',
    TASK_STILL_PROCESSING: '处理中的任务无法删除，请先取消任务',
    TASK_ALREADY_DELETED: '任务已在回收站中',
    TASK_NOT_IN_TRASH: '任务不在回收站中',
    TEMPLATE_NOT_FOUND: '模板不存在',
    TEMPLATE_NAME_DUPLICATE: '模板名称已存在',
    VIRAL_ANALYSIS_NOT_FOUND: '爆款分析记录不存在',
    DNA_NOT_FOUND: '爆款 DNA 不存在',
    DNA_INSUFFICIENT_SAMPLES: '样本不足，无法提取 DNA',
    MATERIAL_NOT_FOUND: '素材不存在',
    PRODUCT_NOT_FOUND: '商品不存在',
    INVALID_REQUEST: '请求参数无效',
    UPLOAD_FAILED: '上传失败',
    INTERNAL_ERROR: '内部服务器错误',
  },
  'en-US': {
    SCRIPT_NOT_FOUND: 'Script not found',
    CREATION_NOT_FOUND: 'Creation task not found',
    TASK_STILL_PROCESSING: 'Cannot delete a running task. Please cancel it first.',
    TASK_ALREADY_DELETED: 'Task is already in trash',
    TASK_NOT_IN_TRASH: 'Task is not in trash',
    TEMPLATE_NOT_FOUND: 'Template not found',
    TEMPLATE_NAME_DUPLICATE: 'Template name already exists',
    VIRAL_ANALYSIS_NOT_FOUND: 'Viral analysis not found',
    DNA_NOT_FOUND: 'Viral DNA not found',
    DNA_INSUFFICIENT_SAMPLES: 'Insufficient samples for DNA extraction',
    MATERIAL_NOT_FOUND: 'Material not found',
    PRODUCT_NOT_FOUND: 'Product not found',
    INVALID_REQUEST: 'Invalid request',
    UPLOAD_FAILED: 'Upload failed',
    INTERNAL_ERROR: 'Internal server error',
  },
  'id-ID': {
    SCRIPT_NOT_FOUND: 'Skrip tidak ditemukan',
    CREATION_NOT_FOUND: 'Tugas pembuatan tidak ditemukan',
    TASK_STILL_PROCESSING: 'Tidak dapat menghapus tugas yang sedang berjalan. Harap batalkan terlebih dahulu.',
    TASK_ALREADY_DELETED: 'Tugas sudah ada di tempat sampah',
    TASK_NOT_IN_TRASH: 'Tugas tidak ada di tempat sampah',
    TEMPLATE_NOT_FOUND: 'Template tidak ditemukan',
    TEMPLATE_NAME_DUPLICATE: 'Nama template sudah ada',
    VIRAL_ANALYSIS_NOT_FOUND: 'Analisis viral tidak ditemukan',
    DNA_NOT_FOUND: 'DNA viral tidak ditemukan',
    DNA_INSUFFICIENT_SAMPLES: 'Sampel tidak cukup untuk ekstraksi DNA',
    MATERIAL_NOT_FOUND: 'Materi tidak ditemukan',
    PRODUCT_NOT_FOUND: 'Produk tidak ditemukan',
    INVALID_REQUEST: 'Permintaan tidak valid',
    UPLOAD_FAILED: 'Unggahan gagal',
    INTERNAL_ERROR: 'Kesalahan server internal',
  },
};

export function getLocalizedMessage(code: string, lang: string): string {
  return ERROR_MESSAGES[lang]?.[code] ?? ERROR_MESSAGES['zh-CN']?.[code] ?? code;
}
