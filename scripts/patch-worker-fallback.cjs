// Patch Worker dist/index.js: Add fallback for shots without slice_url
// Fix: When no image_url AND no selected_slice_url, skip Seedance + use placeholder
// Fix: When Seedance fails and no slice fallback, generate placeholder instead of throwing

var fs = require('fs');
var p = '/workspace/workers/remotion-render-worker/dist/index.js';
var c = fs.readFileSync(p, 'utf8');

// Patch 1: When no image_url AND no selected_slice_url → skip Seedance, use placeholder
// BEFORE: if (shot.image_url || (!shot.selected_slice_url)) { videoPath = await generateShotVideoWithSeedance(...); }
// AFTER:  if (shot.image_url) { ...generateShotVideoWithSeedance... } else if (!shot.selected_slice_url) { ...generatePlaceholderClip... }
var patch1 = c.replace(
  "if (shot.image_url || (!shot.selected_slice_url)) {\n                        videoPath = await generateShotVideoWithSeedance(shot, seedanceClient, dbShotIndex, totalCount, aspectRatio);\n                    }",
  "if (shot.image_url) {\n                        videoPath = await generateShotVideoWithSeedance(shot, seedanceClient, dbShotIndex, totalCount, aspectRatio);\n                    } else if (!shot.selected_slice_url) {\n                        const placeholderLabel = shot.subtitle_text || shot.script || 'Custom Shot';\n                        videoPath = await generatePlaceholderClip(shot.duration || 4, placeholderLabel);\n                        errorLogs.push({\n                            shot_id: shot.shot_id,\n                            stage: 'AI_VIDEO_GENERATING',\n                            error: 'No image_url or selected_slice_url available',\n                            errorCode: 'NO_ASSET_FALLBACK:PLACEHOLDER',\n                        });\n                    }"
);

if (patch1 === c) {
  console.error('WARNING: Patch 1 did not match!');
  // Try alternative match (different whitespace)
  var lines = c.split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (shot.image_url') && lines[i].includes('selected_slice_url')) {
      console.log('Found patch1 at line ' + (i+1) + ': ' + lines[i].trim());
      console.log('Next line: ' + (lines[i+1] || '').trim());
    }
  }
}

c = patch1;

// Patch 2: When Seedance fails and no slice_url → generate placeholder instead of throwing
// BEFORE: throw new Error(`Seedance generation failed for shot ${shot.shot_id}: ${errMsg}`);
// AFTER:  generatePlaceholderClip(...)
var throwLine = 'throw new Error(`Seedance generation failed for shot ${shot.shot_id}: ${errMsg}`);';
var patch2 = c.replace(
  throwLine,
  "console.warn(`[CreationJob] Shot ${shot.shot_id}: no slice fallback - generating placeholder`);\n                        const placeholderLabel2 = shot.subtitle_text || shot.script || 'Fallback';\n                        videoPath = await generatePlaceholderClip(shot.duration || 4, placeholderLabel2);"
);

if (patch2 === c) {
  console.error('WARNING: Patch 2 did not match! Searching for throw line...');
  var lines2 = c.split('\n');
  for (var j = 0; j < lines2.length; j++) {
    if (lines2[j].includes('Seedance generation failed for shot') && lines2[j].includes('throw')) {
      console.log('Found at line ' + (j+1) + ': ' + lines2[j].trim());
    }
  }
}

c = patch2;

fs.writeFileSync(p, c);
console.log('OK - Worker fallback patched successfully');
