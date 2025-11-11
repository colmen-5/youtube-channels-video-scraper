'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const settings = require('./config/settings.json');
const { RateController } = require('./helpers/rate_controller');
const { fetchChannelVideos } = require('./helpers/youtube_parser');
const { exportToJson } = require('./output/data_exporter');

// Load environment variables from .env if present
dotenv.config();

async function loadChannelsConfig(rootDir, inputFile) {
const inputPath = path.resolve(rootDir, inputFile);

if (!fs.existsSync(inputPath)) {
throw new Error(
`Input configuration file not found at "${inputPath}". ` +
'Please create it based on "data/input.example.json".'
);
}

try {
const raw = fs.readFileSync(inputPath, 'utf8');
const parsed = JSON.parse(raw);
if (!parsed.channels || !Array.isArray(parsed.channels)) {
throw new Error('Input JSON must contain a "channels" array.');
}
return parsed.channels;
} catch (err) {
throw new Error(`Failed to read or parse channels config: ${err.message}`);
}
}

async function run() {
const rootDir = path.resolve(__dirname, '..');
console.log('YouTube Channels Video Scraper starting...');
console.log(`Project root: ${rootDir}`);

const apiKey = process.env[settings.apiKeyEnvVar];

if (!apiKey) {
console.error(
`Missing YouTube API key. Please set environment variable "${settings.apiKeyEnvVar}".`
);
console.error('You can copy ".env.example" to ".env" and set your key there.');
process.exitCode = 1;
return;
}

let channels;
try {
channels = await loadChannelsConfig(rootDir, settings.inputFile);
} catch (err) {
console.error(err.message);
process.exitCode = 1;
return;
}

if (channels.length === 0) {
console.warn('No channels defined in the input configuration. Nothing to do.');
return;
}

console.log(`Loaded ${channels.length} channel configuration(s).`);

const rateController = new RateController({
requestsPerSecond: settings.requestsPerSecond,
});

const allVideos = [];
for (const channelConfig of channels) {
const label = channelConfig.channelId || channelConfig.channelUrl || 'Unknown channel';
console.log(`\n=== Processing channel: ${label} ===`);
try {
const videos = await fetchChannelVideos(channelConfig, settings, rateController);
console.log(`Fetched ${videos.length} video(s) for channel: ${label}`);
allVideos.push(...videos);
} catch (err) {
console.error(
`Failed to fetch videos for channel "${label}": ${err.message}`
);
}
}

if (allVideos.length === 0) {
console.warn('No videos were fetched from any channel. Exiting without writing output.');
return;
}

try {
await exportToJson(allVideos, settings.outputFile);
} catch (err) {
console.error(`Failed to write output file: ${err.message}`);
process.exitCode = 1;
return;
}

console.log('\nScraping run completed successfully.');
}

(async () => {
try {
await run();
} catch (err) {
console.error('Unexpected fatal error:', err);
process.exitCode = 1;
}
})();