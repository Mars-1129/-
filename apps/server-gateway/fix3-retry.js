const fs = require('fs');
const s = fs.readFileSync('src/material/material.service.ts', 'utf8');

// Exact replacement - verified pattern context
const oldStr = "`),\r\n        );\r\n      } else if (allSlices.length === 0)";

const newStr = "`);\r\n\r\n        if (!hasFailed) {\r\n          void this.buildMaterialEmbeddingIfCompleted(materialId).catch((err) => {\r\n            this.logger.warn('[BatchCallback] embedding build failed for ' + materialId + ': ' + (err as Error).message);\r\n          });\r\n        }\r\n      } else if (allSlices.length === 0)";

const result = s.replace(oldStr, newStr);

if (result === s) {
  console.log('ERROR: Replacement did not match!');
} else {
  fs.writeFileSync('src/material/material.service.ts', result);
  console.log('Fix 3 applied successfully');
}
