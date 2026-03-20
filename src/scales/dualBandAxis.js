/**
 * dualBandAxis.js
 *
 * Factory for a dual-band (two-row) time axis component, compatible with D3 v7.
 * Renders a context row (coarse, non-repeating boundary labels) and a detail
 * row (fine, every tick) inside a caller-supplied <g> element via selection.call().
 *
 * Timestamps in the scale domain are in **microseconds**. UTC methods are used
 * throughout because the underlying data is UTC-naive.
 *
 * Usage:
 *   import { createDualBandAxis } from '../scales/dualBandAxis.js';
 *   const axis = createDualBandAxis({ scale: xScale });
 *   axisGroup.call(axis);         // render
 *   axisGroup.call(axis);         // re-render after zoom (uses latest scale state)
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Thresholds in seconds
const DAY_S    = 86400;
const HOUR_S   = 3600;
const MINUTE_S = 60;
const TEN_S    = 10;

// ─── Format helpers ──────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function hhMM(date) {
    return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

function hhMMSS(date) {
    return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function monthDay(date) {
    return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

// ─── Band-pair selection ─────────────────────────────────────────────────────

/**
 * Returns { contextFmt, detailFmt, contextKey } for the current visible range.
 *
 * contextFmt(dateUs)  → string shown in the context row
 * detailFmt(dateUs)   → string shown in the detail row
 * contextKey(dateUs)  → opaque string; context label is printed only when this
 *                        value changes from one tick to the next
 *
 * @param {number} rangeUs - visible range in microseconds
 */
function selectBandFormats(rangeUs) {
    const rangeS = rangeUs / 1_000_000;

    // > 30 days: Year / "Nov 3"
    if (rangeS > 30 * DAY_S) {
        return {
            contextFmt: (us) => String(new Date(us / 1000).getUTCFullYear()),
            detailFmt:  (us) => monthDay(new Date(us / 1000)),
            contextKey: (us) => String(new Date(us / 1000).getUTCFullYear()),
        };
    }

    // > 1 day: "Nov 3" / "HH:MM"
    if (rangeS > DAY_S) {
        return {
            contextFmt: (us) => monthDay(new Date(us / 1000)),
            detailFmt:  (us) => hhMM(new Date(us / 1000)),
            contextKey: (us) => {
                const d = new Date(us / 1000);
                return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
            },
        };
    }

    // > 1 hour: "Nov 3" / "HH:MM:SS"
    if (rangeS > HOUR_S) {
        return {
            contextFmt: (us) => monthDay(new Date(us / 1000)),
            detailFmt:  (us) => hhMMSS(new Date(us / 1000)),
            contextKey: (us) => {
                const d = new Date(us / 1000);
                return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
            },
        };
    }

    // > 1 minute: "Nov 3 14h" / "HH:MM:SS"
    if (rangeS > MINUTE_S) {
        return {
            contextFmt: (us) => {
                const d = new Date(us / 1000);
                return `${monthDay(d)} ${pad2(d.getUTCHours())}h`;
            },
            detailFmt: (us) => hhMMSS(new Date(us / 1000)),
            contextKey: (us) => {
                const d = new Date(us / 1000);
                return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
            },
        };
    }

    // > 10 seconds: "HH:MM" / ":SS.cs"
    if (rangeS > TEN_S) {
        return {
            contextFmt: (us) => hhMM(new Date(us / 1000)),
            detailFmt: (us) => {
                const d = new Date(us / 1000);
                const microPart = Math.floor(us) % 1_000_000;
                const cs = String(Math.floor(microPart / 10000)).padStart(2, '0');
                return `:${pad2(d.getUTCSeconds())}.${cs}`;
            },
            contextKey: (us) => {
                const d = new Date(us / 1000);
                return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
            },
        };
    }

    // ≤ 10 seconds: "HH:MM:SS" / ".cs"
    return {
        contextFmt: (us) => hhMMSS(new Date(us / 1000)),
        detailFmt: (us) => {
            const microPart = Math.floor(us) % 1_000_000;
            const cs = String(Math.floor(microPart / 10000)).padStart(2, '0');
            return `.${cs}`;
        },
        contextKey: (us) => {
            const d = new Date(us / 1000);
            return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}-${d.getUTCSeconds()}`;
        },
    };
}

// ─── Public factory ──────────────────────────────────────────────────────────

/**
 * Create a dual-band time axis component.
 *
 * @param {Object} options
 * @param {Function} options.scale           - D3 scale whose domain is in microseconds (required)
 * @param {'bottom'|'top'} [options.orientation='bottom']
 * @param {'above'|'below'} [options.contextPosition='above']  - context row position relative to detail
 * @param {number|null} [options.detailTickCount=null]          - tick count hint (null = D3 auto)
 * @param {string} [options.contextColor='#888']
 * @param {string} [options.detailColor='#333']
 * @param {string} [options.contextFontSize='10px']
 * @param {string} [options.detailFontSize='11px']
 * @param {number} [options.rowGap=4]        - px gap between context and detail text baselines
 * @returns {Function} axis component — call via selection.call(axis)
 */
export function createDualBandAxis(options) {
    const {
        scale,
        orientation      = 'bottom',
        contextPosition  = 'below',
        detailTickCount  = null,
        contextColor     = '#888',
        detailColor      = '#333',
        contextFontSize  = '10px',
        detailFontSize   = '11px',
        rowGap           = 4,
    } = options;

    const detailFontPx  = parseFloat(detailFontSize)  || 11;
    const contextFontPx = parseFloat(contextFontSize) || 10;

    // Both rows below the axis line: detail first, context further down
    const detailDy  = detailFontPx + 2;
    const contextDy = detailDy + contextFontPx + rowGap;

    // ── The callable axis function ──────────────────────────────────────────
    function dualBandAxis(selection) {
        const domain   = scale.domain();
        const rangeUs  = domain[1] - domain[0];

        const { contextFmt, detailFmt, contextKey } = selectBandFormats(rangeUs);

        const tickCount  = detailTickCount != null ? detailTickCount : 10;
        const tickValues = scale.ticks(tickCount);

        // ── Tick line group ────────────────────────────────────────────────
        // Draw a thin domain line and tick lines ourselves so we control the
        // vertical extent.
        const tickSize = 6;

        // Remove and recreate sub-groups on each call so stale data is cleared.
        selection.selectAll('.dba-domain').remove();
        selection.selectAll('.dba-ticks').remove();

        // Domain line (horizontal rule)
        const [r0, r1] = scale.range();
        selection.append('line')
            .attr('class', 'dba-domain')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1)
            .attr('x1', r0)
            .attr('x2', r1)
            .attr('y1', 0)
            .attr('y2', 0);

        const tickGroup = selection.append('g').attr('class', 'dba-ticks');

        // Build per-tick data: determine which ticks get a context label
        // (only the first tick in each new context bucket).
        let lastCtxKey = null;
        const tickData = tickValues.map((us) => {
            const ck = contextKey(us);
            const showContext = ck !== lastCtxKey;
            lastCtxKey = ck;
            return { us, showContext, ctxLabel: showContext ? contextFmt(us) : null };
        });

        // Render one <g> per tick
        const ticks = tickGroup.selectAll('g.dba-tick')
            .data(tickData, d => d.us)
            .join('g')
                .attr('class', 'dba-tick')
                .attr('transform', d => `translate(${scale(d.us)},0)`);

        // Tick line — extends downward from axis line
        ticks.append('line')
            .attr('stroke', '#999')
            .attr('stroke-width', 0.5)
            .attr('y1', 0)
            .attr('y2', tickSize);

        // Detail label (every tick)
        ticks.append('text')
            .attr('class', 'dba-detail')
            .attr('text-anchor', 'middle')
            .attr('x', 0)
            .attr('y', detailDy)
            .style('font-size', detailFontSize)
            .style('fill', detailColor)
            .style('font-family', 'monospace, monospace')
            .text(d => detailFmt(d.us));

        // Context label (boundary ticks only)
        ticks.filter(d => d.showContext)
            .append('text')
                .attr('class', 'dba-context')
                .attr('text-anchor', 'middle')
                .attr('x', 0)
                .attr('y', contextDy)
                .style('font-size', contextFontSize)
                .style('fill', contextColor)
                .style('font-family', 'sans-serif')
                .text(d => d.ctxLabel);
    }

    return dualBandAxis;
}
