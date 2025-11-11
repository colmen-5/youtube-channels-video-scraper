'use strict';

const fs = require('fs');
const path = require('path');

/**
* Writes scraped video data to a JSON file.
* @param {Array<Object>} records - List of video records.
* @param {string} outputRelativePath - Output file path relative to project root.
*/
async function exportToJson(records, outputRelativePath) {
if (!Array.isArray(records)) {
throw new Error('Records must be an array.');
}

const rootDir = path.resolve(__dirname, '..', '..');
const outputPath = path.resolve(rootDir, outputRelativePath);
const outputDir = path.dirname(outputPath);

try {
fs.mkdirSync(outputDir, { recursive: true });
} catch (err) {
throw new Error(`Failed to ensure output directory: ${err.message}`);
}

const payload = {
generated_at: new Date().toISOString(),
total_videos: records.length,
videos: records,
};

return new Promise((resolve, reject) => {
fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8', (err) => {
if (err) {
return reject(
new Error(`Failed to write output file "${outputPath}": ${err.message}`)
);
}
console.log(`Output written to: ${outputPath}`);
resolve();
});
});
}

module.exports = {
exportToJson,
};