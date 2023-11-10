// @ts-nocheck
/* eslint-disable accessor-pairs */
/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable func-names */
/* eslint-disable func-style */
/* eslint-disable getter-return */
/* eslint-disable no-setter-return */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable prefer-reflect */
/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */

// Based on https://github.com/ua-reduction/ua-client-hints-crawler/blob/b972c07fcdfab0e60e440ae87220b61bb49b5ea7/helpers/fingerprintDetection.js

(function() {
    const frameUrl = document.location.href;
    const MAX_NUM_CALLS_TO_INTERCEPT = 100;
    const STACK_LINE_REGEXP = /(\()?(http[^)]+):[0-9]+:[0-9]+(\))?/;
    let accessCounts = {};  // keep the access and call counts for each property and function
    const ENABLE_CONSOLE_LOGS = false;
    const console_log = function() {
        if (ENABLE_CONSOLE_LOGS) {
            console.log.apply(console, arguments);
        }
    };
    const getSourceFromStack = function() {
        const stack = new Error().stack.split("\n");
        stack.shift();  // remove our own intercepting functions from the stack
        stack.shift();
        const res = stack[1].match(STACK_LINE_REGEXP);
        return res ? res[2] : "UNKNOWN_SOURCE";
    };

    const interceptFunctionCall = function (elementType, funcName) {
        // save the original function using a closure
        console_log(`Intercepting ${elementType.name}.${funcName}`);
        const origFunc = elementType.prototype[funcName];
        // overwrite the object method with our own
        Object.defineProperty(elementType.prototype, funcName, {
            value () {
                // execute the original function
                const retVal = origFunc.apply(this, arguments);
                const calledFunc = `${elementType.name}.${funcName}`;
                // check and enforce the limits
                // increment the call count or init if needed
                accessCounts[calledFunc] = (accessCounts[calledFunc] || 0) + 1;
                const callCnt = accessCounts[calledFunc];  // just a shorthand
                if (callCnt >= MAX_NUM_CALLS_TO_INTERCEPT) {
                    console_log(`Reached max number of calls for ${calledFunc}: ${callCnt}`);
                    // revert the function to its original state
                    Object.defineProperty(elementType.prototype, funcName, {
                        value () {return origFunc.apply(this, arguments);}
                    });
                    return retVal;
                }
                // we still haven't reached the limit; we intercept the call
                console_log(`Intercepted call to ${calledFunc} ${callCnt} times`);
                const source = getSourceFromStack();
                const callDetails = {
                    description: calledFunc,
                    accessType: "call",
                    args: arguments,
                    retVal,
                    source,
                    frameUrl,
                    referrer: document.referrer
                };
                console_log(`Calling calledAPIEvent with ${JSON.stringify(callDetails)}`);
                // send the call details to the node context
                // @ts-ignore
                window.calledAPIEvent(callDetails);
                return retVal;
            }
        });
    };
    const interceptPropAccess = function (elementType, propertyName) {
        // Limit api calls to intercept
        // save the original property descriptor using a closure
        const origObjPropDesc = Object.getOwnPropertyDescriptor(
        elementType.prototype,
        propertyName
      );
        // log property name
        const accessedProp = `${elementType.name}.${propertyName}`;
        Object.defineProperty(elementType.prototype, propertyName, {
            enumerable: true,
            configurable: true,
            get () {
                let returnVal = origObjPropDesc.get.call(this);
                // check and enforce the limits
                accessCounts[accessedProp] = (accessCounts[accessedProp] || 0) + 1;
                const accessCnt = accessCounts[accessedProp];  // just a shorthand
                if (accessCnt >= MAX_NUM_CALLS_TO_INTERCEPT) {
                    console_log(`Reached max number of accesses for ${accessedProp}: ${accessCnt} `);
                    // revert the setter to its original state
                    Object.defineProperty(elementType.prototype, propertyName, {
                        get () {return origObjPropDesc.get.call(this);}
                    });
                    return;
                }
                // we still haven't reached the limit; we intercept the access
                console_log(`Intercepted property access (get) ${accessedProp} (${accessCnt} times)`);
                const source = getSourceFromStack();
                const callDetails = {
                    description: accessedProp,
                    accessType: "get",
                    args: "",
                    source,
                    frameUrl,
                    referrer: document.referrer
                };
                // send the call details to the node context
                // @ts-ignore
                window.calledAPIEvent(callDetails);
                return returnVal;
            },  // TODO
            set (value) {
                // set the given value using the original property setter
                origObjPropDesc.set.call(this, value);

                // check and enforce the limits
                accessCounts[accessedProp] = (accessCounts[accessedProp] || 0) + 1;
                const accessCnt = accessCounts[accessedProp];  // just a shorthand
                if (accessCnt >= MAX_NUM_CALLS_TO_INTERCEPT) {
                    console_log(`Reached max number of accesses for ${accessedProp}: ${accessCnt} `);
                    // revert the setter to its original state
                    Object.defineProperty(elementType.prototype, propertyName, {
                        set () {return origObjPropDesc.set.call(this, value);}
                    });
                    return;
                }
                // we still haven't reached the limit; we intercept the access
                console_log(`Intercepted property access (set) ${accessedProp} (${accessCnt} times)`);
                const source = getSourceFromStack();
                const callDetails = {
                    description: accessedProp,
                    accessType: "set",
                    args: value,
                    source,
                    frameUrl
                };
                // send the call details to the node context
                // @ts-ignore
                window.calledAPIEvent(callDetails);
            },
        });
    };

    // FLoC
    interceptFunctionCall(Document, 'interestCohort');

    // Topics API
    interceptFunctionCall(Document, 'browsingTopics');

    // Protected Audience API
    interceptFunctionCall(Navigator, 'joinAdInterestGroup');
    interceptFunctionCall(Navigator, 'runAdAuction');
}());