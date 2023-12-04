/* eslint-disable max-lines */
const BaseCollector = require('./BaseCollector');
const {scrollPageToBottom, scrollPageToTop} = require('puppeteer-autoscroll-down');
const path = require('path');
const tld = require('tldts');
// const https = require('https');
const fs = require('fs');
const puppeteer = require('puppeteer');
const chalk = require('chalk').default;
const axios = require("axios").default;

const linkCollectorSrc = fs.readFileSync('./helpers/linkCollector.js', 'utf8');

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
         * @type {{ source: any; description: string; arguments: any; returnValue: any; accessType: string, frameURL: string, referrer: string, subpageIndex: number}[]}
         */
        this._calls = [];
        this._callStats = {};
        this._log = log;
        this._subpageIndex = -1;
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
                frameURL: apiCall.frameUrl,
                referrer: apiCall.referrer,
                subpageIndex: this._subpageIndex
            });
        });
    }

    /**
     * @param {string} urlString
     * @param {function(string):boolean} urlFilter
     * @param {string | URL | null} urlBase the base of the URL to use when urlString is a relative path
     * @return {URL?}
     */
    getAcceptableUrl(urlString, urlFilter, urlBase) {
        let url;

        try {
            url = urlBase ? new URL(urlString, urlBase) : new URL(urlString);
        } catch (e) {
            // ignore requests with invalid URL
            return null;
        }

        // ignore inlined resources
        // eslint-disable-next-line no-script-url
        if (url.protocol === 'data:' || url.protocol === 'javascript:') {
            return null;
        }

        if (urlFilter && !urlFilter(url.href)) {
            return null;
        }

        return url;
    }

    /**
     * Based on https://gist.github.com/gunesacar/336bc2952ebae778160b8cdfd75e3970#file-link_collector-js-L97
     * @param {string} linkUrlStripped 
     * @param {*} pageDomain 
     * @param {*} pageUrl 
     * @returns 
     */
    isClickCandidate(linkUrlStripped, pageDomain, pageUrl) {
        const EXCLUDED_EXTS = [".jpg", ".jpeg", ".pdf", ".png", ".svg"];

        // no links to external domains
        if (tld.getDomain(linkUrlStripped) !== pageDomain) {
            // external link
            this._log(`Will skip the external link: ${linkUrlStripped}`);
            return false;
        }

        // no pdf, png etc, links
        if (EXCLUDED_EXTS.some(fileExt => linkUrlStripped.includes(fileExt))) {
            this._log(`Bad file extension, will skip: ${linkUrlStripped}`);
            return false;
        }

        // no links without path and param: abc.com/, abc.com/#
        // remove trailing slash and # from the page url
        const pageUrlStripped = pageUrl.replace(/#$/, '').replace(/\/$/, '');
        if (linkUrlStripped === pageUrlStripped) {  // same page link
            this._log(`Skipping same page link: ${linkUrlStripped} (pageUrl: ${pageUrl}) `);
            return false;
        }

        return true;
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
     * @param {URL} url file URL
     * @param {string} outputPath path to put data in (from CLI)
     * @param {string} folder  main folder to put the file in ("bidding" or "decision")
     * @param {string} baseURL URL of the website being crawled
     */
    async saveFileFromURL(url, outputPath, folder, baseURL) {
        try {
            let filePath = path.join(outputPath, folder, new URL(baseURL).hostname, url.hostname, url.pathname);
            await fs.promises.mkdir(path.dirname(filePath), {recursive: true});

            const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36';
            const response = await axios.get(url.href, {responseType: "stream", headers: {'User-Agent': DEFAULT_USER_AGENT}});
            const file = fs.createWriteStream(filePath);
            const stream = response.data.pipe(file);
            stream.on("finish", () => file.close());
            // @ts-ignore
            stream.on("error", error => {
                file.close();
                this._log(`Error while downloading ${folder} logic from ${url}:`, error.message);
            });
        } catch (error) {
            this._log(`Error while downloading ${folder} logic`, error);
        }
    }

    /**
     * @param {{finalUrl: string, urlFilter?: function(string):boolean, page: import('puppeteer-core').Page, outputPath: string}} options
     * @returns {Promise<{callStats: Object<string, import('./APICallCollector').APICallData>, savedCalls: import('./APICallCollector').SavedCall[], crawledSubpages: SubpageData[]}>}
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

        /**
         * @type {{distance: number, href: string, title: string, text: string, xpath: string}[]}
         */
        // @ts-ignore
        const links = await page.evaluate(linkCollectorSrc);
        const pageUrl = page.url().toLowerCase();
        const pageDomain = tld.getDomain(pageUrl);
        this._log(`Found ${links.length} links for ${pageDomain}`);

        const NR_OF_SUBPAGES_TO_CRAWL = 1;

        /**
         * @type {SubpageData[]}
         */
        const crawledSubpages = [];
        
        for (const link of links) {
            if (!link.href) {continue;}
            // convert relative links to absolute
            link.href = new URL(link.href, pageUrl).href;
            const linkUrlStripped = link.href.replace(/#$/, '').replace(/\/$/, '');

            if (!this.isClickCandidate(linkUrlStripped, pageDomain, pageUrl)) {continue;}
            if (crawledSubpages.some(subpage => subpage.initialUrl === link.href || subpage.finalUrl === link.href)) {continue;}

            // Click on the link
            try {
                /* eslint-disable no-await-in-loop */
                this._log(`Attempting to navigate to: ${link.href}`);
                // const [linkElement] = await page.$x(link.xpath);
                // if (linkElement) {
                //     this._log(`Found link element for: ${link.href}, going there now...`);
                //     await linkElement.click();

                // Goto linked subpage (more reliable then trying to click the button)
                let timeout = false;
                const switchTime = Date.now();
                this._subpageIndex = crawledSubpages.length;

                try {
                    await page.goto(link.href, {timeout: 30000, waitUntil: 'networkidle0'});
                } catch (e) {
                    if (e instanceof puppeteer.errors.TimeoutError || (e.name && e.name === 'TimeoutError')) {
                        this._log(chalk.yellow('Navigation timeout exceeded.'));
                        timeout = true;
                    } else {
                        throw e;
                    }
                }

                await page.waitForTimeout(2500);  // wait for new tab to be opened

                try {
                    this._log('Scrolling page to bottom and up');
                    await this.scrollToBottomAndUp(page);
                } catch (error) {
                    this._log('Error while scrolling page', error);
                }

                crawledSubpages.push({
                    initialUrl: link.href,
                    finalUrl: page.url(),
                    timestamp: switchTime,
                    timeout
                });
                if (crawledSubpages.length >= NR_OF_SUBPAGES_TO_CRAWL) {break;}
            } catch (error) {
                this._log(`Error navigating to ${link.href}: ${error.message}`);
            }
        }


        this._stats.forEach((calls, source) => {
            if (!this.getAcceptableUrl(source, urlFilter, null)) {
                return;
            }
            callStats[source] = Array.from(calls).reduce((/** @type {Object<string, number>} */result, [script, number]) => {
                result[script] = number;
                return result;
            }, {});
        });

        // Collect interesting Protected Audience API scripts
        for (const call of this._calls) {
            if (call.description.endsWith("joinAdInterestGroup")) {
                const config = call.arguments["0"];
                /** @type {any} */
                const configNormalized = {};
                if (config) {
                    for (let key of Object.keys(config)) {
                        // Sometimes they use Url and sometimes URL...
                        configNormalized[key.toLowerCase()] = config[key];
                    }
                }
                if (!config || !configNormalized.biddinglogicurl) {
                    this._log("No bidding logic:\n", call.arguments);
                    continue;
                }
                let url = this.getAcceptableUrl(configNormalized.biddinglogicurl, urlFilter, configNormalized.owner);
                if (!url) {
                    this._log("Bad bidding logic url:", configNormalized.owner, configNormalized.biddinglogicurl);
                    continue;
                }
                this.saveFileFromURL(url, outputPath, "bidding", finalUrl);
            } else if (call.description.endsWith("runAdAuction")) {
                const config = call.arguments[0];
                /** @type {any} */
                const configNormalized = {};
                if (config) {
                    for (let key of Object.keys(config)) {
                        // Sometimes they use Url and sometimes URL...
                        configNormalized[key.toLowerCase()] = config[key];
                    }
                }
                if (!config || !configNormalized.decisionlogicurl) {
                    this._log("No decision logic:\n", call.arguments);
                    continue;
                }
                let url = this.getAcceptableUrl(configNormalized.decisionlogicurl, urlFilter, configNormalized.seller);
                if (!url) {
                    this._log("Bad decision logic url:", configNormalized.seller, configNormalized.decisionlogicurl);
                    continue;
                }
                this.saveFileFromURL(url, outputPath, "decision", finalUrl);
            }
        }

        return {
            callStats,
            savedCalls: this._calls.filter(call => this.getAcceptableUrl(call.source, urlFilter, null)),
            crawledSubpages
        };
    }
}

module.exports = PSCollector;

/**
 * @typedef SubpageData
 * @property {string} initialUrl
 * @property {string} finalUrl
 * @property {number} timestamp
 * @property {boolean} timeout
 */

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