const fs = require('fs');
const s = fs.readFileSync('src/material/material.service.ts', 'utf8');

// Search for exact pattern around line 2778-2780
const pattern = "slices=${allSlices.length})\`,  \r\n        );\r\n      } else if";
const patterns = [
  "slices=${allSlices.length})`,",
  "(slices=${allSlices.length})",
  "else if (allSlices.length === 0)",
];

for (const p of patterns) {
  const idx = s.indexOf(p);
  console.log('Pattern:', JSON.stringify(p.slice(0,40)), '| Found at:', idx);
  if (idx >= 0) {
    console.log('  Context:', JSON.stringify(s.slice(idx-5, idx+60)));
  }
}
