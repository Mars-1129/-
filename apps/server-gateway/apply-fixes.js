const fs = require('fs');

// Fix 1: Add findCreationByTaskId to creation.repository.ts
var repo1 = fs.readFileSync('src/creation/creation.repository.ts', 'utf8');
var search1 = 'async findCreationById(creationId: string):';
var insert1 = 'async findCreationByTaskId(taskId: string): Promise<{ id: string; productId: string; } | null> {\r\n    return this.prisma.creation.findFirst({ where: { taskId }, select: { id: true, productId: true } });\r\n  }\r\n\r\n  async findCreationById(creationId: string):';
repo1 = repo1.replace(search1, insert1);
fs.writeFileSync('src/creation/creation.repository.ts', repo1);
console.log('Fix 1: Done');

// Fix 2: Fix creation.service.ts
var svc2 = fs.readFileSync('src/creation/creation.service.ts', 'utf8');
svc2 = svc2.replace(
  'const cr = await this.repository.findCreationById(body.task_id);',
  'const cr = await this.repository.findCreationByTaskId(body.task_id);'
);
fs.writeFileSync('src/creation/creation.service.ts', svc2);
console.log('Fix 2: Done');

// Fix 3: Add buildMaterialEmbeddingIfCompleted to handleBatchCallback
var svc3 = fs.readFileSync('src/material/material.service.ts', 'utf8');
var search3 = "slices=${allSlices.length}`);";
// This matches the end of the log line and the );
var replace3 = "slices=${allSlices.length}`);\r\n\r\n        if (!hasFailed) {\r\n          void this.buildMaterialEmbeddingIfCompleted(materialId).catch((err) => {\r\n            this.logger.warn('[BatchCallback] embedding build failed for ' + materialId + ': ' + (err).message);\r\n          });\r\n        }";
svc3 = svc3.replace(search3, replace3);
fs.writeFileSync('src/material/material.service.ts', svc3);
console.log('Fix 3: Done');

console.log('All fixes applied');
