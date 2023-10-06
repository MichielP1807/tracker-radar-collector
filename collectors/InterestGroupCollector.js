/* eslint-disable max-lines */
const BaseCollector = require('./BaseCollector');

class InterestGroupCollector extends BaseCollector {

    id() {
        return 'interestGroups';
    }

    /**
     * @param {import('./BaseCollector').CollectorInitOptions} options 
     */
    init({log}) {
        /**
         * @type {any[]}
         */
        this._interestGroups = [];
        this._log = log;
    }

    /**
     * @param {{cdpClient: import('puppeteer').CDPSession, url: string, type: import('./TargetCollector').TargetType}} targetInfo 
     */
    async addTarget({cdpClient}) {
        await cdpClient.send('Storage.setInterestGroupTracking', {"enable": true});

        await Promise.all([
            cdpClient.on('Storage.interestGroupAccessed', r => this.handleInterestGroup(r))
        ]);
    }

    /**
     * 
     * @param {import("devtools-protocol").Protocol.Storage.InterestGroupAccessedEvent} group 
     */
    handleInterestGroup(group) {
        this._log('Interest group event:', group);
        this._interestGroups.push(group);
    }

    /**
     * @returns {any[]}
     */
    getData() {
        return this._interestGroups;
    }
}

module.exports = InterestGroupCollector;
