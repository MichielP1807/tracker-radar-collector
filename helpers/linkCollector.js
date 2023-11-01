// @ts-nocheck
/* eslint-disable consistent-return */
/* eslint-disable no-undef */

// Based on https://gist.github.com/gunesacar/336bc2952ebae778160b8cdfd75e3970

(function getLinks() {
    // const links = window.document.querySelectorAll('a, button');
    const links = window.document.querySelectorAll('a'); // only links, no buttons
    const getXPathOfElement = element => {
        if (element.id !== '') {return 'id("' + element.id + '")';}
        if (element === document.body) {return element.tagName;}
        let ix = 0;
        const siblings = element.parentNode.childNodes;
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {return getXPathOfElement(element.parentNode) + '/' + element.tagName + '[' + (ix + 1) + ']';}
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {ix++;}
        }
    };
    const center = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
    let linkAttrs = [];
    for (const link of links) {
        if (link.tagName.toLowerCase() === 'button' && !link.onclick && !link.type === 'submit') {
            continue; // Skip non-clickable buttons
        }
        const rect = link.getBoundingClientRect();
        const linkCenter = {
            x: rect.left + (rect.width / 2),
            y: rect.top + (rect.height / 2)
        };
        const distance = Math.hypot(center.x - linkCenter.x, center.y - linkCenter.y);
        const href = link.getAttribute('href');
        const title = link.getAttribute('title');
        const text = link.innerText;
        const xpath = getXPathOfElement(link);
        if (href || link.tagName.toLowerCase() === 'button') {
            linkAttrs.push({
                distance,
                href,
                title,
                text,
                xpath
            });
        }
    }
    linkAttrs.sort((a, b) => a.distance - b.distance);
    return linkAttrs;
}());