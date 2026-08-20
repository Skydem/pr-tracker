import {
  REVIEWER_STATE_LABELS,
  formatAge,
  initials,
  type PRHeadlineState,
  type ReviewerState,
} from "../utils/review-state.js";
import type {
  Board,
  BoardPullRequest,
  BoardReviewer,
  PersonBoard,
  PersonLoad,
} from "../services/dashboard.service.js";
import { DASHBOARD_STYLES } from "./dashboard.styles.js";

const STATE_TOKENS: Record<ReviewerState, string> = {
  AWAITING_FIRST_REVIEW: "wait",
  AWAITING_RE_REVIEW: "rere",
  CHANGES_REQUESTED: "stop",
  APPROVED: "ok",
};

const PR_STATE_TOKENS: Record<PRHeadlineState, string> = {
  BLOCKED: "stop",
  AWAITING_RE_REVIEW: "rere",
  AWAITING_FIRST_REVIEW: "wait",
  READY_TO_MERGE: "ok",
  NO_REVIEWERS: "muted",
};

const ICON_PATHS: Record<ReviewerState, string> = {
  AWAITING_FIRST_REVIEW:
    '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.2 2"></path>',
  AWAITING_RE_REVIEW:
    '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 4v5h-5"></path>',
  CHANGES_REQUESTED: '<path d="M18 6 6 18M6 6l12 12"></path>',
  APPROVED: '<path d="M20 6 9 17l-5-5"></path>',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function icon(state: ReviewerState, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="var(--${STATE_TOKENS[state]})" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[state]}</svg>`;
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

function reviewerChip(reviewer: BoardReviewer): string {
  const token = STATE_TOKENS[reviewer.state];
  const label = `${reviewer.displayName} — ${REVIEWER_STATE_LABELS[reviewer.state]}`;
  return `<span class="chip chip-${token}" title="${escapeHtml(label)}"><span class="avatar avatar-${token}">${escapeHtml(initials(reviewer.displayName))}</span>${icon(reviewer.state, 13)}</span>`;
}

function prRow(pr: BoardPullRequest): string {
  const token = PR_STATE_TOKENS[pr.state];
  const titleCell = pr.url
    ? `<a href="${escapeHtml(pr.url)}" rel="noreferrer noopener" target="_blank">${escapeHtml(pr.title)}</a>`
    : escapeHtml(pr.title);

  const waiting =
    pr.state === "READY_TO_MERGE"
      ? "ready to merge"
      : pr.waitingOn.length > 0
        ? `on ${pr.waitingOn.map(firstName).join(", ")}`
        : "no reviewers assigned";

  return `<div class="row row-${token}">
  <div class="row-main">
    <div class="row-title"><span class="mono muted">#${pr.bitbucketId}</span><span class="title">${titleCell}</span>${pr.stale ? '<span class="badge badge-wait">Stale</span>' : ""}</div>
    <div class="mono muted small">${escapeHtml(pr.repositorySlug)} &nbsp;·&nbsp; ${escapeHtml(pr.sourceBranch)} → ${escapeHtml(pr.destBranch)}</div>
  </div>
  <div class="row-author"><span class="avatar avatar-plain">${escapeHtml(initials(pr.authorName))}</span><span class="small">${escapeHtml(pr.authorName)}</span></div>
  <div class="row-reviewers">${pr.reviewers.map(reviewerChip).join("") || '<span class="small muted">none</span>'}</div>
  <div class="wait-cell"><span class="mono age age-${token}">${pr.state === "READY_TO_MERGE" ? "ready" : escapeHtml(formatAge(pr.ageMs))}</span><span class="caps muted">${escapeHtml(waiting)}</span></div>
</div>`;
}

function loadBar(person: PersonLoad): string {
  const segments: [number, string][] = [
    [person.awaitingFirstReview, "wait"],
    [person.awaitingReReview, "rere"],
    [person.changesRequested, "stop"],
    [person.approved, "ok"],
  ];
  return segments
    .filter(([count]) => count > 0)
    .map(([count, token]) => `<i class="seg seg-${token}" style="flex-grow:${count}"></i>`)
    .join("");
}

function personCard(person: PersonLoad): string {
  const parts: string[] = [];
  if (person.awaitingFirstReview > 0) parts.push(`${person.awaitingFirstReview} waiting`);
  if (person.awaitingReReview > 0) parts.push(`${person.awaitingReReview} re-review`);
  if (person.changesRequested > 0) parts.push(`${person.changesRequested} blocking`);
  if (person.approved > 0) parts.push(`${person.approved} done`);

  return `<a class="person" href="/dashboard?person=${encodeURIComponent(person.userId)}">
  <div class="person-head"><span class="avatar avatar-plain">${escapeHtml(initials(person.displayName))}</span><span class="person-name">${escapeHtml(person.displayName)}</span><span class="mono person-count">${person.awaitingTotal}</span></div>
  <div class="bar">${loadBar(person)}</div>
  <div class="mono small muted">${escapeHtml(parts.join(" · ")) || "nothing assigned"}</div>
</a>`;
}

function personPicker(people: PersonLoad[], selectedId: string | null): string {
  const chips = people.map(
    (person) =>
      `<a class="pick${person.userId === selectedId ? " pick-on" : ""}" href="/dashboard?person=${encodeURIComponent(person.userId)}"><span class="avatar avatar-plain">${escapeHtml(initials(person.displayName))}</span>${escapeHtml(firstName(person.displayName))}</a>`
  );

  return `<nav class="picker"><span class="caps muted">I am</span><a class="pick${selectedId === null ? " pick-on" : ""}" href="/dashboard">Everyone</a>${chips.join("")}</nav>`;
}

function countPill(token: string, count: number, label: string): string {
  return `<span class="pill pill-${token}"><i class="dot dot-${token}"></i>${count} ${escapeHtml(label)}</span>`;
}

function emptyState(message: string): string {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function legend(): string {
  const entries = (Object.keys(REVIEWER_STATE_LABELS) as ReviewerState[]).map(
    (state) =>
      `<span class="legend-item">${icon(state, 13)}<span class="small">${escapeHtml(REVIEWER_STATE_LABELS[state])}</span></span>`
  );
  return `<div class="legend"><span class="caps muted">Legend</span>${entries.join("")}</div>`;
}

export function renderBoard(board: Board): string {
  const rows =
    board.pullRequests.length > 0
      ? board.pullRequests.map(prRow).join("")
      : emptyState("No open pull requests. Nothing is waiting on anyone.");

  const rail =
    board.people.length > 0
      ? board.people.map(personCard).join("")
      : emptyState("No reviewers assigned on any open PR.");

  return layout({
    heading: "Review floor",
    subheading: `${board.pullRequests.length} open pull request${board.pullRequests.length === 1 ? "" : "s"}`,
    picker: personPicker(board.people, null),
    pills: [
      countPill("stop", board.counts.BLOCKED, "blocked"),
      countPill("rere", board.counts.AWAITING_RE_REVIEW, "re-review"),
      countPill("wait", board.counts.AWAITING_FIRST_REVIEW, "waiting"),
      countPill("ok", board.counts.READY_TO_MERGE, "ready"),
    ].join(""),
    body: `<div class="split">
  <div class="main">
    <div class="head-row"><div>Pull request</div><div>Author</div><div>Reviewers</div><div class="right">Waiting</div></div>
    <div class="rows">${rows}</div>
    ${legend()}
  </div>
  <aside class="rail">
    <div class="caps muted">Load by person</div>
    <div class="rail-list">${rail}</div>
    <div class="rail-note">Stale after ${board.staleDays} day${board.staleDays === 1 ? "" : "s"} without activity.</div>
  </aside>
</div>`,
    generatedAt: board.generatedAt,
  });
}

export function renderPersonBoard(person: PersonBoard, board: Board): string {
  const section = (
    title: string,
    note: string,
    prs: BoardPullRequest[],
    fallback: string
  ): string =>
    `<section class="section">
  <div class="section-head"><span class="section-title">${escapeHtml(title)}</span><span class="mono section-count">${prs.length}</span><span class="small muted">${escapeHtml(note)}</span></div>
  <div class="rows">${prs.length > 0 ? prs.map(prRow).join("") : emptyState(fallback)}</div>
</section>`;

  return layout({
    heading: person.displayName,
    subheading: `${person.toReview.length} review${person.toReview.length === 1 ? "" : "s"} waiting on you`,
    picker: personPicker(board.people, person.userId),
    pills: "",
    body: `<div class="stack">
  ${section("Waiting on you", "your review is what these need next", person.toReview, "Nothing is waiting on your review.")}
  ${section("Your pull requests", "opened by you and still open", person.authored, "You have no open pull requests.")}
  ${section("Already reviewed", "you have responded, nothing needed from you", person.alreadyReviewed, "You have not reviewed any open PR yet.")}
  ${legend()}
</div>`,
    generatedAt: board.generatedAt,
  });
}

export function renderNotFound(message: string): string {
  return layout({
    heading: "Not found",
    subheading: "",
    picker: "",
    pills: "",
    body: `<div class="stack">${emptyState(message)}<div><a class="pick" href="/dashboard">Back to the board</a></div></div>`,
    generatedAt: new Date(),
  });
}

interface LayoutInput {
  heading: string;
  subheading: string;
  picker: string;
  pills: string;
  body: string;
  generatedAt: Date;
}

function layout(input: LayoutInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(input.heading)} · PR Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>${DASHBOARD_STYLES}</style>
</head>
<body>
<header class="topbar">
  <div class="brand"><span class="mark"></span><span class="wordmark">${escapeHtml(input.heading)}</span><span class="small muted">${escapeHtml(input.subheading)}</span></div>
  <div class="topbar-right">${input.pills}<button type="button" class="theme" data-theme-toggle aria-label="Toggle dark and light theme"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg></button></div>
</header>
${input.picker}
<main>${input.body}</main>
<footer class="foot mono muted">Updated ${escapeHtml(formatTimestamp(input.generatedAt))} · read-only</footer>
<script>
(function () {
  var key = "pr-tracker-theme";
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem(key); } catch (error) { stored = null; }
  if (stored === "dark" || stored === "light") root.setAttribute("data-theme", stored);
  var button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  button.addEventListener("click", function () {
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = root.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(key, next); } catch (error) {}
  });
})();
</script>
</body>
</html>`;
}
