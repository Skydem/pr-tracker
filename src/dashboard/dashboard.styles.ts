export const DASHBOARD_STYLES = `
:root {
  --bg: oklch(0.975 0.004 265); --panel: oklch(1 0 0); --panel-2: oklch(0.962 0.006 265);
  --line: oklch(0.885 0.010 265); --ink: oklch(0.21 0.014 265); --ink-2: oklch(0.44 0.014 265);
  --ink-3: oklch(0.545 0.013 265);
  --ok: oklch(0.47 0.145 152); --wait: oklch(0.47 0.145 72); --rere: oklch(0.47 0.145 292);
  --stop: oklch(0.47 0.145 25); --muted: oklch(0.52 0.013 265);
  --ok-bg: oklch(0.945 0.045 152); --wait-bg: oklch(0.945 0.045 72);
  --rere-bg: oklch(0.945 0.045 292); --stop-bg: oklch(0.945 0.045 25);
  --muted-bg: oklch(0.945 0.006 265); --on-accent: oklch(1 0 0);
  --shadow: oklch(0.32 0.03 265 / 0.16);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: oklch(0.17 0.012 265); --panel: oklch(0.212 0.014 265); --panel-2: oklch(0.248 0.014 265);
    --line: oklch(0.325 0.014 265); --ink: oklch(0.95 0.008 265); --ink-2: oklch(0.78 0.012 265);
    --ink-3: oklch(0.665 0.014 265);
    --ok: oklch(0.80 0.14 152); --wait: oklch(0.81 0.14 72); --rere: oklch(0.80 0.14 292);
    --stop: oklch(0.78 0.14 25); --muted: oklch(0.665 0.014 265);
    --ok-bg: oklch(0.285 0.055 152); --wait-bg: oklch(0.285 0.055 72);
    --rere-bg: oklch(0.285 0.055 292); --stop-bg: oklch(0.285 0.055 25);
    --muted-bg: oklch(0.26 0.010 265); --on-accent: oklch(0.16 0.012 265);
    --shadow: oklch(0 0 0 / 0.55);
  }
}
:root[data-theme="dark"] {
  --bg: oklch(0.17 0.012 265); --panel: oklch(0.212 0.014 265); --panel-2: oklch(0.248 0.014 265);
  --line: oklch(0.325 0.014 265); --ink: oklch(0.95 0.008 265); --ink-2: oklch(0.78 0.012 265);
  --ink-3: oklch(0.665 0.014 265);
  --ok: oklch(0.80 0.14 152); --wait: oklch(0.81 0.14 72); --rere: oklch(0.80 0.14 292);
  --stop: oklch(0.78 0.14 25); --muted: oklch(0.665 0.014 265);
  --ok-bg: oklch(0.285 0.055 152); --wait-bg: oklch(0.285 0.055 72);
  --rere-bg: oklch(0.285 0.055 292); --stop-bg: oklch(0.285 0.055 25);
  --muted-bg: oklch(0.26 0.010 265); --on-accent: oklch(0.16 0.012 265);
  --shadow: oklch(0 0 0 / 0.55);
}
* { box-sizing: border-box; }
body { margin: 0; padding-bottom: 84px; background: var(--bg); color: var(--ink); font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 4px; }
.mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.caps { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; }
.right { text-align: right; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.mark { width: 10px; height: 10px; border-radius: 3px; background: var(--ink); align-self: center; }
.wordmark { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 16px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.topbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.theme { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink-2); cursor: pointer; }
.theme:hover { color: var(--ink); }
.pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border-radius: 999px; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pill-stop { background: var(--stop-bg); color: var(--stop); }
.pill-rere { background: var(--rere-bg); color: var(--rere); }
.pill-wait { background: var(--wait-bg); color: var(--wait); }
.pill-ok { background: var(--ok-bg); color: var(--ok); }
.dot { width: 7px; height: 7px; border-radius: 50%; }
.dot-stop { background: var(--stop); } .dot-rere { background: var(--rere); }
.dot-wait { background: var(--wait); } .dot-ok { background: var(--ok); }
.picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 14px 24px; border-bottom: 1px solid var(--line); }
.pick { display: inline-flex; align-items: center; gap: 8px; padding: 5px 14px 5px 6px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font-size: 13px; color: var(--ink-2); min-height: 36px; }
.pick:hover { text-decoration: none; border-color: var(--ink-3); color: var(--ink); }
.pick-on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.pick-on .avatar-plain { background: var(--bg); color: var(--ink); border-color: transparent; }
main { padding: 22px 24px 8px; max-width: 1680px; }
.split { display: grid; grid-template-columns: minmax(0, 1fr) 296px; gap: 22px; align-items: start; }
@media (max-width: 1000px) { .split { grid-template-columns: minmax(0, 1fr); } }
.head-row, .row { display: grid; grid-template-columns: minmax(0, 1fr) 170px 250px 152px; gap: 18px; }
@media (max-width: 860px) { .head-row { display: none; } .row { grid-template-columns: minmax(0, 1fr); } }
.head-row { padding: 0 16px 12px; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-3); }
.rows { display: flex; flex-direction: column; gap: 9px; }
.row { align-items: center; padding: 15px 16px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--line); }
.row-stop { border-left-color: var(--stop); } .row-rere { border-left-color: var(--rere); }
.row-wait { border-left-color: var(--wait); } .row-ok { border-left-color: var(--ok); }
.row-main { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.row-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.title { font-size: 16px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.meta { color: var(--ink-3); }
.row-author { display: flex; align-items: center; gap: 8px; color: var(--ink-2); }
.row-reviewers { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.wait-cell { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; text-align: right; }
@media (max-width: 860px) { .wait-cell { align-items: flex-start; text-align: left; } }
.age { font-size: 17px; font-weight: 600; line-height: 1.3; }
.wait-note { font-size: 13px; line-height: 1.35; color: var(--ink-2); }
.age-stop { color: var(--stop); } .age-rere { color: var(--rere); }
.age-wait { color: var(--wait); } .age-ok { color: var(--ok); } .age-muted { color: var(--ink-2); }
.avatar { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 10px; font-weight: 700; line-height: 1; flex-shrink: 0; }
.avatar-plain { background: var(--panel-2); border: 1px solid var(--line); color: var(--ink-2); width: 26px; height: 26px; font-size: 11px; }
.avatar-ok { background: var(--ok); color: var(--on-accent); } .avatar-wait { background: var(--wait); color: var(--on-accent); }
.avatar-rere { background: var(--rere); color: var(--on-accent); } .avatar-stop { background: var(--stop); color: var(--on-accent); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px 4px 4px; border-radius: 999px; }
.chip-ok { background: var(--ok-bg); } .chip-wait { background: var(--wait-bg); }
.chip-rere { background: var(--rere-bg); } .chip-stop { background: var(--stop-bg); }
.badge { padding: 2px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.badge-wait { background: var(--wait-bg); color: var(--wait); }
.rail { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.rail-list { display: flex; flex-direction: column; gap: 13px; }
.person { display: flex; flex-direction: column; gap: 7px; }
.person:hover { text-decoration: none; }
.person:hover .person-name { text-decoration: underline; }
.person-head { display: flex; align-items: center; gap: 9px; }
.person-name { font-size: 14px; font-weight: 500; }
.person-count { margin-left: auto; font-size: 14px; font-weight: 600; color: var(--ink-2); }
.bar { display: flex; gap: 3px; height: 7px; }
.seg { border-radius: 3px; }
.seg-ok { background: var(--ok); } .seg-wait { background: var(--wait); }
.seg-rere { background: var(--rere); } .seg-stop { background: var(--stop); }
.rail-note { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.legend { position: fixed; z-index: 20; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; max-width: calc(100vw - 32px); padding: 11px 20px; border-radius: 999px; background: color-mix(in oklch, var(--panel) 86%, transparent); border: 1px solid var(--line); box-shadow: 0 10px 30px var(--shadow); backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4); }
@media (max-width: 620px) { .legend { gap: 12px 16px; padding: 10px 16px; border-radius: 18px; } }
.legend-item { display: inline-flex; align-items: center; gap: 7px; color: var(--ink-2); }
.stack { display: flex; flex-direction: column; gap: 34px; max-width: 1240px; }
.section { display: flex; flex-direction: column; gap: 14px; }
.section-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.section-title { font-size: 25px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.section-count { font-size: 16px; font-weight: 600; color: var(--ink-2); }
.empty { padding: 22px 18px; border-radius: 10px; border: 1px dashed var(--line); color: var(--muted); font-size: 14px; }
.foot { padding: 18px 24px 26px; font-size: 12px; }
`;
