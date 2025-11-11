'use strict';

/**
* Simple rate controller that spaces out requests to approximately
* the configured number of requests per second.
*
* It executes scheduled tasks sequentially to respect the rate limit.
*/
class RateController {
/**
* @param {Object} options
* @param {number} options.requestsPerSecond
*/
constructor(options) {
const rps = Number(options.requestsPerSecond) || 1;
this.intervalMs = 1000 / rps;
this.nextAvailableTime = Date.now();
this.queue = Promise.resolve();
}

/**
* Schedules a function to run under rate limiting.
* @param {Function} taskFn - Function that returns a Promise.
* @returns {Promise<*>}
*/
schedule(taskFn) {
this.queue = this.queue.then(() => this._runTask(taskFn));
return this.queue;
}

async _runTask(taskFn) {
const now = Date.now();
const waitMs = this.nextAvailableTime - now;

if (waitMs > 0) {
await new Promise((resolve) => setTimeout(resolve, waitMs));
}

const start = Date.now();
this.nextAvailableTime = start + this.intervalMs;

try {
return await taskFn();
} catch (err) {
// Allow caller to handle the error, but provide basic logging
console.error('RateController: task failed:', err.message || err);
throw err;
}
}
}

module.exports = {
RateController,
};