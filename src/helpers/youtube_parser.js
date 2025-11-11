'use strict';

const axios = require('axios');

/**
* Converts ISO8601 YouTube duration (e.g., PT36M25S) into a human-readable string.
* Example: PT36M25S -> "36 minutes, 25 seconds"
*/
function humanizeDuration(isoDuration) {
if (!isoDuration || typeof isoDuration !== 'string') {
return null;
}

// Basic ISO8601 duration parser for formats used by YouTube (PT#H#M#S)
const regex = /P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
const match = isoDuration.match(regex);
if (!match) return isoDuration;

const hours = parseInt(match[1] || '0', 10);
const minutes = parseInt(match[2] || '0', 10);
const seconds = parseInt(match[3] || '0', 10);

const parts = [];
if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
if (!hours && !minutes && seconds) {
// Only show seconds if clip is under 1 minute to keep it concise
parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
} else if (seconds) {
parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
}

return parts.join(', ') || null;
}

/**
* Extracts a channelId from common YouTube channel URL formats.
* Currently supports /channel/{id} URLs.
*/
function extractChannelIdFromUrl(url) {
if (!url || typeof url !== 'string') return null;

// Direct /channel/{id}
const channelMatch = url.match(/\/channel\/([^/?]+)/i);
if (channelMatch) {
return channelMatch[1];
}

// Other URL formats (handles, custom URLs) would require additional API calls or HTML parsing.
// For now, we only support explicit channel IDs in URLs for reliability.
return null;
}

/**
* Derives a pseudo-handle from a channel title when real handle is unavailable.
*/
function deriveChannelHandle(channelTitle) {
if (!channelTitle) return null;
// Remove non-word characters and spaces to create a simple handle-like string
const compact = channelTitle.replace(/[^\w]+/g, '');
if (!compact) return null;
return `@${compact}`;
}

/**
* Fetches videos for a given channel using the YouTube Data API v3.
* @param {Object} channelConfig - Channel configuration object.
* @param {Object} settings - Global settings.
* @param {RateController} rateController - Rate controller instance.
* @returns {Promise<Array<Object>>} List of video records.
*/
async function fetchChannelVideos(channelConfig, settings, rateController) {
const apiKey = process.env[settings.apiKeyEnvVar];
if (!apiKey) {
throw new Error(
`Environment variable "${settings.apiKeyEnvVar}" is not set; cannot call YouTube API.`
);
}

let channelId = channelConfig.channelId;
if (!channelId && channelConfig.channelUrl) {
channelId = extractChannelIdFromUrl(channelConfig.channelUrl);
}

if (!channelId) {
throw new Error(
'Channel configuration must include either "channelId" or a URL containing "/channel/{id}".'
);
}

const maxVideos =
typeof channelConfig.maxVideos === 'number' && channelConfig.maxVideos > 0
? channelConfig.maxVideos
: settings.maxVideosPerChannel;

const searchEndpoint = 'https://www.googleapis.com/youtube/v3/search';
const videosEndpoint = 'https://www.googleapis.com/youtube/v3/videos';

let remaining = maxVideos;
let pageToken = undefined;
const allRecords = [];

while (remaining > 0) {
const batchSize = Math.min(remaining, 50);

const searchParams = {
key: apiKey,
part: 'snippet',
channelId,
order: 'date',
maxResults: batchSize,
pageToken,
type: 'video',
safeSearch: 'none',
};

let searchResponse;
try {
searchResponse = await rateController.schedule(() =>
axios.get(searchEndpoint, { params: searchParams })
);
} catch (err) {
throw new Error(
`Failed to call YouTube search endpoint for channel "${channelId}": ${err.message}`
);
}

const searchData = searchResponse.data || {};
const items = Array.isArray(searchData.items) ? searchData.items : [];
if (items.length === 0) {
break;
}

const videoIds = items
.map((item) => item.id && item.id.videoId)
.filter(Boolean);

if (videoIds.length === 0) {
break;
}

let videosResponse;
try {
videosResponse = await rateController.schedule(() =>
axios.get(videosEndpoint, {
params: {
key: apiKey,
part: 'snippet,contentDetails,statistics',
id: videoIds.join(','),
},
})
);
} catch (err) {
throw new Error(
`Failed to call YouTube videos endpoint: ${err.message}`
);
}

const videoData = videosResponse.data || {};
const videoItems = Array.isArray(videoData.items) ? videoData.items : [];

for (const video of videoItems) {
const id = video.id;
const snippet = video.snippet || {};
const stats = video.statistics || {};
const contentDetails = video.contentDetails || {};

if (!id || !snippet.title) {
continue;
}

const thumbs = snippet.thumbnails || {};
const thumb =
thumbs.maxres || thumbs.standard || thumbs.high || thumbs.medium || thumbs.default;

const viewCount = stats.viewCount ? Number(stats.viewCount) : null;
const likeCount = stats.likeCount ? Number(stats.likeCount) : null;

const durationHuman = humanizeDuration(contentDetails.duration);

const channelTitle = snippet.channelTitle || null;
const channelHandle = deriveChannelHandle(channelTitle);
const channelUrl = `https://www.youtube.com/channel/${snippet.channelId || channelId}`;

const record = {
video_id: id,
video_title: snippet.title,
video_url: `https://www.youtube.com/watch?v=${id}`,
views: viewCount,
likes: likeCount,
video_thumbnail: thumb ? thumb.url : null,
video_duration: durationHuman,
published_time: snippet.publishedAt || null,
description_snippet: snippet.description
? snippet.description.substring(0, 300)
: '',
channel_title: channelTitle,
channel_handle: channelHandle,
channel_url: channelUrl,
channel_info: {
channel_title: channelTitle,
channel_handle: channelHandle,
channel_url: channelUrl,
},
};

allRecords.push(record);
remaining -= 1;
if (remaining <= 0) {
break;
}
}

if (!searchData.nextPageToken || remaining <= 0) {
break;
}
pageToken = searchData.nextPageToken;
}

return allRecords;
}

module.exports = {
fetchChannelVideos,
};