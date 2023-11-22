/* eslint-disable max-lines */
/**
 * @type {{global?: string, proto?: string, props: PropertyBreakpoint[], methods: MethodBreakpoint[]}[]}
 */
const breakpoints = [
    {
        proto: 'Document',
        props: [],
        methods: [
            {name: 'interestCohort', saveArguments: true}, // FLoC
            {name: 'browsingTopics', saveArguments: true}, // Topics API
        ]
    },
    {
        proto: 'Navigator',
        props: [],
        methods: [
            // Protected Audience API
            {name: 'joinAdInterestGroup', saveArguments: true},
            {name: 'updateAdInterestGroups', saveArguments: true},
            {name: 'leaveAdInterestGroup', saveArguments: true},
            {name: 'runAdAuction', saveArguments: true},
        ]
    },
];

module.exports = breakpoints;

/**
 * @typedef MethodBreakpoint
 * @property {string} name - name of the method
 * @property {string=} test - test expression that should trigger given breakpoint
 * @property {string=} description - human readable description of a breakpoint
 * @property {string=} condition - additional condition that has to be truthy for the breakpoint to fire
 * @property {boolean=} saveArguments - save arguments of each call (defaults to false)
 * @property {string=} cdpId - optional breakpointID from CDP
 */

/**
 * @typedef PropertyBreakpoint
 * @property {string} name - name of the property
 * @property {string=} test - test expression that should trigger given breakpoint
 * @property {string=} description - human readable description of a breakpoint
 * @property {string=} condition - additional condition that has to be truthy for the breakpoint to fire
 * @property {boolean=} saveArguments - save arguments of each call (defaults to false)
 * @property {boolean=} setter - hook up to a property setter instead of getter (which is a default)
 * @property {string=} cdpId - optional breakpointID from CDP
 */

/**
 * @typedef {MethodBreakpoint | PropertyBreakpoint} Breakpoint
 */