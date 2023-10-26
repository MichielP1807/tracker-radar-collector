const BaseCollector = require('./BaseCollector');
const {scrollPageToBottom, scrollPageToTop} = require('puppeteer-autoscroll-down');
const path = require('path');
const https = require('https');
const fs = require('fs');

// Based on https://github.com/ua-reduction/ua-client-hints-crawler/blob/b972c07fcdfab0e60e440ae87220b61bb49b5ea7/collectors/FingerprintCollector.js

class PSCollector extends BaseCollector {

    id() {
        return 'privacySandbox';
    }

    /**
     * @param {import('./BaseCollector').CollectorInitOptions} options 
     */
    init({
        log,
    }) {
        /**
         * @type {Map<string, Map<string, number>>}
         */
        this._stats = new Map();
        /**
         * @type {{ source: any; description: string; arguments: any; returnValue: any; accessType: string, frameURL: string}[]}
         */
        this._calls = [];
        this._callStats = {};
        this._log = log;
    }

    /**
     * @param {{ exposeFunction: (arg0: string, arg1: (apiCall: any) => void) => any; url: () => any; }} page
     */

    async addListener(page) {
        await page.exposeFunction('calledAPIEvent', apiCall => {
            if (!(apiCall && apiCall.source && apiCall.description)) {
                // call details are missing
                this._log('Missing call details', apiCall);
                return;
            }
            let sourceStats = null;
            if (this._stats.has(apiCall.source)) {
                sourceStats = this._stats.get(apiCall.source);
            } else {
                sourceStats = new Map();
                this._stats.set(apiCall.source, sourceStats);
            }

            let count = 0;

            if (sourceStats.has(apiCall.description)) {
                count = sourceStats.get(apiCall.description);
            }

            sourceStats.set(apiCall.description, count + 1);

            this._calls.push({
                source: apiCall.source,
                description: apiCall.description,
                arguments: apiCall.args,
                returnValue: apiCall.retVal,
                accessType: apiCall.accessType,
                frameURL: apiCall.frameUrl
            });
        });
    }

    /**
     * @param {string} urlString
     * @param {function(string):boolean} urlFilter
     */
    isAcceptableUrl(urlString, urlFilter) {
        let url;

        try {
            url = new URL(urlString);
        } catch (e) {
            // ignore requests with invalid URL
            return false;
        }

        // ignore inlined resources
        if (url.protocol === 'data:') {
            return false;
        }

        return urlFilter ? urlFilter(urlString) : true;
    }

    /**
     * @param {number} maxValue
     */
    getRandomUpTo(maxValue) {
        return Math.floor(Math.random() * maxValue);
    }

    /**
     * @param {import('puppeteer-core').Page} page
     */
    async scrollToBottomAndUp(page) {
        await scrollPageToBottom(page, {
            size: 500 + this.getRandomUpTo(100),
            delay: 500 + this.getRandomUpTo(100),
            stepsLimit: 10
        });
        await new Promise(r => setTimeout(r, 1000));
        await scrollPageToTop(page, {
            size: 500 + this.getRandomUpTo(100),
            delay: 150 + this.getRandomUpTo(100),
            stepsLimit: 10
        });
    }

    /**
     * @param {string} url file URL
     * @param {string} outputPath path to put data in (from CLI)
     * @param {string} folder  main folder to put the file in ("bidding" or "decision")
     * @param {string} baseURL URL of the website being crawled
     */
    async saveFileFromURL(url, outputPath, folder, baseURL) {
        try {
            const decodedURL = new URL(url);
            let filePath = path.join(outputPath, folder, new URL(baseURL).hostname, decodedURL.hostname, decodedURL.pathname);
            await fs.promises.mkdir(path.dirname(filePath), {recursive: true});

            await new Promise(resolve => {
                const file = fs.createWriteStream(filePath);
                https.get(url, response => {
                    response.pipe(file);
                    file.on("finish", () => {
                        file.close();
                        resolve();
                    });
                });
            });
        } catch (error) {
            this._log(`Error while downloading ${folder} logic`, error);
        }
    }

    /**
     * @param {{finalUrl: string, urlFilter?: function(string):boolean, page: any, outputPath: string}} options
     * @returns {Promise<{callStats: Object<string, import('./APICallCollector').APICallData>, savedCalls: import('./APICallCollector').SavedCall[]}>}
     */
    async getData({finalUrl, urlFilter, page, outputPath}) {
        /**
         * @type {Object<string, import('./APICallCollector').APICallData>}
         */
        const callStats = {};
        try {
            this._log('Scrolling page to bottom and up');
            await this.scrollToBottomAndUp(page);
        } catch (error) {
            this._log('Error while scrolling page', error);
        }
        this._log('Waiting for 5 seconds');
        await page.waitForTimeout(5000);
        this._stats
             .forEach((calls, source) => {
                 if (!this.isAcceptableUrl(source, urlFilter)) {
                     return;
                 }
                 callStats[source] = Array.from(calls)
                     .reduce((/** @type {Object<string, number>} */result, [script, number]) => {
                         result[script] = number;
                         return result;
                     }, {});
             });
        
        // Collect interesting Protected Audience API scripts
        for (const call of this._calls) {
            if (call.description.endsWith("joinAdInterestGroup")) {
                const config = call.arguments["0"];
                /** @type {any} */ 
                const configNormalized = {}
                if (config) {
                    for (let key of Object.keys(config)) {
                        // Sometimes they use Url and sometimes URL...
                        configNormalized[key.toLowerCase()] = config[key]
                    }
                }
                if (!config || !configNormalized.biddinglogicurl) {
                    this._log("No bidding logic:\n", call.arguments);
                    continue;
                }
                let url = configNormalized.biddinglogicurl;
                if (!this.isAcceptableUrl(url, urlFilter)) {
                    url = config.owner + configNormalized.biddinglogicurl;
                }
                if (!this.isAcceptableUrl(url, urlFilter)) {
                    this._log("Bad bidding logic url:", config.owner, configNormalized.biddinglogicurl);
                    continue;
                }
                this.saveFileFromURL(url, outputPath, "bidding", finalUrl);
            } else if (call.description.endsWith("runAdAuction")) {
                const config = call.arguments[0];
                /** @type {any} */ 
                const configNormalized = {}
                if (config) {
                    for (let key of Object.keys(config)) {
                        // Sometimes they use Url and sometimes URL...
                        configNormalized[key.toLowerCase()] = config[key]
                    }
                }
                if (!config || !configNormalized.decisionlogicurl) {
                    this._log("No decision logic:\n", call.arguments);
                    continue;
                }
                let url = configNormalized.decisionlogicurl;
                if (!this.isAcceptableUrl(url, urlFilter)) {
                    url = config.seller + configNormalized.decisionlogicurl;
                }
                if (!this.isAcceptableUrl(url, urlFilter)) {
                    this._log("Bad decision logic url:", config.seller, configNormalized.decisionlogicurl);
                    continue;
                }
                this.saveFileFromURL(url, outputPath, "decision", finalUrl);
            }
        }
        
        return {
            callStats,
            savedCalls: this._calls.filter(call => this.isAcceptableUrl(call.source, urlFilter))
        };
    }
}

module.exports = PSCollector;

/**
 * @typedef TargetData
 * @property {string} url
 * @property {TargetType} type
 */

/**
 * @typedef {'page'|'background_page'|'service_worker'|'shared_worker'|'other'|'browser'|'webview'} TargetType
 */

/**
 * @typedef Options
 * @property {string} finalUrl
 * @property {function(string):boolean} urlFilter?
 * @property {any} page
 * @property {number} homepageLoadTime
 * @property {string} outputPath
 */