import {
  REVIEWER_STATE_LABELS,
  formatAge,
  initials,
  type PRHeadlineState,
  type ReviewerState,
} from "../utils/review-state.js";
import { ACTIVITY_EVENT_TOKENS } from "../utils/activity.js";
import type {
  ActivityEntry,
  ActivityFeed,
  Board,
  BoardPullRequest,
  BoardReviewer,
  PersonBoard,
  PersonLoad,
  PersonRef,
} from "../services/dashboard.service.js";
import type { Viewer } from "../auth/viewer.js";
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

function requestReReviewControl(pr: BoardPullRequest): string {
  const dialogId = `rr-${pr.id}`;
  const options = pr.reviewers
    .map(
      (reviewer) =>
        `<label class="rr-option"><input type="checkbox" name="reviewerIds" value="${escapeHtml(reviewer.userId)}"><span class="avatar avatar-plain">${escapeHtml(initials(reviewer.displayName))}</span>${escapeHtml(reviewer.displayName)}</label>`
    )
    .join("");

  return `<button type="button" class="rr-trigger" data-rr-open="${dialogId}">Request re-review</button>
<dialog id="${dialogId}" class="rr-dialog" data-rr-dialog data-pr-id="${escapeHtml(pr.id)}">
  <form class="rr-form" data-rr-form>
    <div class="rr-head">Request re-review <span class="mono muted">#${pr.bitbucketId}</span></div>
    <label class="rr-option rr-all"><input type="checkbox" data-rr-all>Select all</label>
    <div class="rr-list">${options}</div>
    <div class="rr-error small" data-rr-error hidden>Select at least one reviewer.</div>
    <div class="rr-actions">
      <button type="button" class="rr-cancel" data-rr-cancel>Cancel</button>
      <button type="submit" class="rr-submit">Request</button>
    </div>
  </form>
</dialog>`;
}

function markReReviewedControl(pr: BoardPullRequest): string {
  return `<button type="button" class="rr-trigger" data-mark-re-reviewed data-pr-id="${escapeHtml(pr.id)}">I re-reviewed it</button>`;
}

function aiReviewBadge(pr: BoardPullRequest): string {
  const review = pr.aiReview;
  if (review === null) return "";

  switch (review.status) {
    case "QUEUED":
      return `<span class="badge badge-rere" data-ai-review-pending title="Requested by ${escapeHtml(review.requestedByName)}">AI review queued</span>`;
    case "RUNNING":
      return `<span class="badge badge-rere" data-ai-review-pending title="Requested by ${escapeHtml(review.requestedByName)}">AI review running</span>`;
    case "COMPLETED":
      return `<span class="badge badge-ok" title="Posted on the pull request${review.finishedAt ? ` at ${escapeHtml(formatTimestamp(review.finishedAt))}` : ""}">AI reviewed</span>`;
    case "FAILED":
      return `<span class="badge badge-stop" title="${escapeHtml(review.error ?? "The review did not finish")}">AI review failed</span>`;
  }
}

function aiReviewControl(pr: BoardPullRequest): string {
  const label = pr.aiReview?.status === "FAILED" ? "Retry AI review" : "Request AI review";
  return `<button type="button" class="rr-trigger" data-ai-review data-pr-id="${escapeHtml(pr.id)}">${label}</button>`;
}

function canRequestAiReview(pr: BoardPullRequest, aiReviewEnabled: boolean): boolean {
  return aiReviewEnabled && (pr.aiReview === null || pr.aiReview.status === "FAILED");
}

interface PrRowOptions {
  authorControls?: boolean;
  viewerUserId?: string | null;
  aiReviewEnabled?: boolean;
}

function prRow(pr: BoardPullRequest, options: PrRowOptions = {}): string {
  const authorControls = options.authorControls ?? false;
  const viewerUserId = options.viewerUserId ?? null;
  const aiReviewEnabled = options.aiReviewEnabled ?? false;
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

  const viewerReviewer = viewerUserId
    ? pr.reviewers.find((reviewer) => reviewer.userId === viewerUserId)
    : undefined;
  const showMarkReReviewed = viewerReviewer?.manualReReviewPending === true;

  return `<div class="row row-${token}">
  <div class="row-main">
    <div class="row-title"><span class="mono muted">#${pr.bitbucketId}</span><span class="title">${titleCell}</span>${pr.stale ? '<span class="badge badge-wait">Stale</span>' : ""}${aiReviewBadge(pr)}</div>
    <div class="mono small meta">${escapeHtml(pr.repositorySlug)} &nbsp;·&nbsp; ${escapeHtml(pr.sourceBranch)} → ${escapeHtml(pr.destBranch)}</div>
  </div>
  <div class="row-author"><span class="avatar avatar-plain">${escapeHtml(initials(pr.authorName))}</span><span class="small">${escapeHtml(pr.authorName)}</span></div>
  <div class="row-reviewers">${pr.reviewers.map(reviewerChip).join("") || '<span class="small muted">none</span>'}</div>
  <div class="wait-cell">
    <span class="mono age age-${token}">${pr.state === "READY_TO_MERGE" ? "ready" : escapeHtml(formatAge(pr.ageMs))}</span>
    <span class="wait-note">${escapeHtml(waiting)}</span>
    ${authorControls && pr.reviewers.length > 0 ? requestReReviewControl(pr) : ""}
    ${authorControls && canRequestAiReview(pr, aiReviewEnabled) ? aiReviewControl(pr) : ""}
    ${showMarkReReviewed ? markReReviewedControl(pr) : ""}
  </div>
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

function personPicker(
  people: PersonRef[],
  selectedId: string | null,
  viewerUserId: string | null,
  basePath: string = "/dashboard"
): string {
  const chips = people.map((person) => {
    const isViewer = person.userId === viewerUserId;
    const classes = `pick${person.userId === selectedId ? " pick-on" : ""}${isViewer ? " pick-you" : ""}`;
    const marker = isViewer ? '<span class="you-tag">you</span>' : "";
    return `<a class="${classes}" href="${basePath}?person=${encodeURIComponent(person.userId)}"${isViewer ? ' title="Confirmed by Slack sign-in"' : ""}><span class="avatar avatar-plain">${escapeHtml(initials(person.displayName))}</span>${escapeHtml(firstName(person.displayName))}${marker}</a>`;
  });

  return `<nav class="picker"><span class="caps muted">I am</span><a class="pick${selectedId === null ? " pick-on" : ""}" href="${basePath}">Everyone</a>${chips.join("")}</nav>`;
}

function slackMark(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 122.8 122.8" aria-hidden="true" focusable="false"><path d="M25.8 77.6a12.9 12.9 0 1 1-12.9-12.9h12.9v12.9zm6.5 0a12.9 12.9 0 0 1 25.8 0v32.3a12.9 12.9 0 0 1-25.8 0V77.6z" fill="#E01E5A"></path><path d="M45.2 25.8a12.9 12.9 0 1 1 12.9-12.9v12.9H45.2zm0 6.5a12.9 12.9 0 0 1 0 25.8H12.9a12.9 12.9 0 0 1 0-25.8h32.3z" fill="#36C5F0"></path><path d="M97 45.2a12.9 12.9 0 1 1 12.9 12.9H97V45.2zm-6.5 0a12.9 12.9 0 0 1-25.8 0V12.9a12.9 12.9 0 0 1 25.8 0v32.3z" fill="#2EB67D"></path><path d="M77.6 97a12.9 12.9 0 1 1-12.9 12.9V97h12.9zm0-6.5a12.9 12.9 0 0 1 0-25.8h32.3a12.9 12.9 0 0 1 0 25.8H77.6z" fill="#ECB22E"></path></svg>`;
}

function authControls(viewer: Viewer | null): string {
  if (viewer === null) {
    return `<a class="signin" href="/auth/slack">${slackMark(15)}Sign in with Slack</a>`;
  }

  const label = `<span class="avatar avatar-plain">${escapeHtml(initials(viewer.displayName))}</span><span class="small">${escapeHtml(viewer.displayName)}</span>`;

  const identity =
    viewer.userId !== null
      ? `<a class="whoami" href="/dashboard?person=${encodeURIComponent(viewer.userId)}" title="Signed in with Slack">${label}<span class="you-tag">you</span></a>`
      : `<span class="whoami" title="Signed in with Slack">${label}<span class="badge badge-wait">Unlinked</span></span>`;

  return `${identity}<form class="signout-form" method="post" action="/auth/logout?returnTo=%2Fdashboard"><button type="submit" class="signout">Sign out</button></form>`;
}

function unlinkedNotice(viewer: Viewer | null): string {
  if (viewer === null || viewer.userId !== null) {
    return "";
  }

  return `<div class="notice">Slack says you are <strong>${escapeHtml(viewer.displayName)}</strong>, but no tracked developer is linked to that account. An admin can connect it with <span class="mono">/pr admin link</span>.</div>`;
}

function tabs(active: "board" | "activity", personId: string | null): string {
  const suffix = personId !== null ? `?person=${encodeURIComponent(personId)}` : "";
  return `<nav class="tabs">
  <a class="tab${active === "board" ? " tab-on" : ""}" href="/dashboard${suffix}">Board</a>
  <a class="tab${active === "activity" ? " tab-on" : ""}" href="/dashboard/activity${suffix}">Recent updates</a>
</nav>`;
}

function activityTimeAgo(entry: ActivityEntry, now: Date): string {
  return `${formatAge(now.getTime() - entry.createdAt.getTime())} ago`;
}

function activityRow(entry: ActivityEntry, now: Date): string {
  const token = ACTIVITY_EVENT_TOKENS[entry.eventType];
  const prLink = entry.prUrl
    ? `<a href="${escapeHtml(entry.prUrl)}" rel="noreferrer noopener" target="_blank">#${entry.bitbucketId} ${escapeHtml(entry.prTitle)}</a>`
    : `<span class="mono">#${entry.bitbucketId}</span> ${escapeHtml(entry.prTitle)}`;

  return `<div class="activity-row">
  <i class="dot dot-${token}"></i>
  <div class="activity-main">
    <div class="activity-message">${escapeHtml(entry.message)}</div>
    <div class="mono small muted">${prLink} &nbsp;·&nbsp; ${escapeHtml(entry.repositorySlug)} &nbsp;·&nbsp; ${escapeHtml(activityTimeAgo(entry, now))}</div>
  </div>
</div>`;
}

function activityRailItem(entry: ActivityEntry, now: Date): string {
  const token = ACTIVITY_EVENT_TOKENS[entry.eventType];
  return `<div class="activity-item">
  <i class="dot dot-${token}"></i>
  <div class="activity-item-body">
    <div class="small">${escapeHtml(entry.message)}</div>
    <div class="mono small muted">${escapeHtml(activityTimeAgo(entry, now))}</div>
  </div>
</div>`;
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

export function renderBoard(board: Board, viewer: Viewer | null = null): string {
  const rows =
    board.pullRequests.length > 0
      ? board.pullRequests.map((pr) => prRow(pr)).join("")
      : emptyState("No open pull requests. Nothing is waiting on anyone.");

  const rail =
    board.people.length > 0
      ? board.people.map(personCard).join("")
      : emptyState("No reviewers assigned on any open PR.");

  return layout({
    heading: "Review floor",
    subheading: `${board.pullRequests.length} open pull request${board.pullRequests.length === 1 ? "" : "s"}`,
    picker: personPicker(board.everyone, null, viewer?.userId ?? null),
    tabs: tabs("board", null),
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
    viewer,
    generatedAt: board.generatedAt,
  });
}

export function renderPersonBoard(
  person: PersonBoard,
  board: Board,
  activity: ActivityFeed,
  viewer: Viewer | null = null
): string {
  const isOwnProfile = viewer !== null && viewer.userId === person.userId;

  const section = (
    title: string,
    note: string,
    prs: BoardPullRequest[],
    fallback: string,
    authorControls: boolean = false,
    viewerUserIdForRow: string | null = null
  ): string =>
    `<section class="section">
  <div class="section-head"><span class="section-title">${escapeHtml(title)}</span><span class="mono section-count">${prs.length}</span><span class="small muted">${escapeHtml(note)}</span></div>
  <div class="rows">${
    prs.length > 0
      ? prs
          .map((pr) =>
            prRow(pr, {
              authorControls,
              viewerUserId: viewerUserIdForRow,
              aiReviewEnabled: board.aiReviewEnabled,
            })
          )
          .join("")
      : emptyState(fallback)
  }</div>
</section>`;

  const activityItems =
    activity.entries.length > 0
      ? activity.entries.map((entry) => activityRailItem(entry, board.generatedAt)).join("")
      : emptyState("No activity yet.");

  return layout({
    heading: person.displayName,
    badge: isOwnProfile ? "This is you" : "",
    subheading: `${person.toReview.length} review${person.toReview.length === 1 ? "" : "s"} waiting on you`,
    picker: personPicker(board.everyone, person.userId, viewer?.userId ?? null),
    tabs: tabs("board", person.userId),
    pills: "",
    body: `<div class="split">
  <div class="main">
    <div class="stack">
      ${section("Waiting on you", "your review is what these need next", person.toReview, "Nothing is waiting on your review.", false, isOwnProfile ? person.userId : null)}
      ${section("Your pull requests", "opened by you and still open", person.authored, "You have no open pull requests.", isOwnProfile)}
      ${section("Already reviewed", "you have responded, nothing needed from you", person.alreadyReviewed, "You have not reviewed any open PR yet.")}
      ${legend()}
    </div>
  </div>
  <aside class="rail">
    <div class="caps muted">Recent activity</div>
    <div class="rail-list activity-list">${activityItems}</div>
    <a class="rail-note" href="/dashboard/activity?person=${encodeURIComponent(person.userId)}">View all activity &rarr;</a>
  </aside>
</div>`,
    viewer,
    generatedAt: board.generatedAt,
  });
}

export function renderActivity(
  activity: ActivityFeed,
  board: Board,
  person: PersonRef | null,
  viewer: Viewer | null = null
): string {
  const rows =
    activity.entries.length > 0
      ? activity.entries.map((entry) => activityRow(entry, board.generatedAt)).join("")
      : emptyState(person ? "No activity yet for this person." : "No activity yet.");

  const loadMoreHref = `/dashboard/activity?limit=${activity.limit + 10}${person ? `&person=${encodeURIComponent(person.userId)}` : ""}`;
  const loadMore = activity.hasMore
    ? `<div class="load-more"><a class="pick" href="${loadMoreHref}">Load more</a></div>`
    : "";

  return layout({
    heading: person ? `${person.displayName} · Recent updates` : "Recent updates",
    subheading: `${activity.entries.length} shown`,
    picker: personPicker(
      board.everyone,
      person?.userId ?? null,
      viewer?.userId ?? null,
      "/dashboard/activity"
    ),
    tabs: tabs("activity", person?.userId ?? null),
    pills: "",
    body: `<div class="stack">
  <div class="activity-list activity-list-wide">${rows}</div>
  ${loadMore}
</div>`,
    viewer,
    generatedAt: board.generatedAt,
  });
}

export function renderNotFound(message: string, viewer: Viewer | null = null): string {
  return renderMessage("Not found", message, viewer);
}

export function renderMessage(
  heading: string,
  message: string,
  viewer: Viewer | null = null
): string {
  return layout({
    heading,
    subheading: "",
    picker: "",
    tabs: "",
    pills: "",
    viewer,
    body: `<div class="stack">${emptyState(message)}<div><a class="pick" href="/dashboard">Back to the board</a></div></div>`,
    generatedAt: new Date(),
  });
}

interface LayoutInput {
  heading: string;
  badge?: string;
  subheading: string;
  picker: string;
  tabs: string;
  pills: string;
  body: string;
  viewer: Viewer | null;
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
  <div class="brand"><span class="mark"></span><span class="wordmark">${escapeHtml(input.heading)}</span>${input.badge ? `<span class="you-tag">${escapeHtml(input.badge)}</span>` : ""}<span class="small muted">${escapeHtml(input.subheading)}</span></div>
  <div class="topbar-right">${input.pills}${authControls(input.viewer)}<button type="button" class="theme" data-theme-toggle aria-label="Toggle dark and light theme"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg></button></div>
</header>
${input.tabs}
${input.picker}
${unlinkedNotice(input.viewer)}
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
(function () {
  if (document.querySelector("[data-ai-review-pending]")) {
    setTimeout(function () { window.location.reload(); }, 30000);
  }

  document.addEventListener("click", function (event) {
    var aiBtn = event.target.closest("[data-ai-review]");
    if (aiBtn) {
      var confirmed = window.confirm("Request an AI code review? It posts one review comment on the pull request in Bitbucket, and each pull request gets one review.");
      if (!confirmed) return;
      aiBtn.disabled = true;
      aiBtn.textContent = "Requesting…";
      fetch("/dashboard/pr/" + aiBtn.getAttribute("data-pr-id") + "/request-ai-review", {
        method: "POST",
      })
        .then(function (response) {
          if (response.ok) {
            window.location.reload();
            return;
          }
          return response.json().catch(function () { return {}; }).then(function (body) {
            throw new Error(body.error || "request failed");
          });
        })
        .catch(function (error) {
          aiBtn.disabled = false;
          aiBtn.textContent = error.message || "Could not request. Try again.";
        });
      return;
    }

    var markBtn = event.target.closest("[data-mark-re-reviewed]");
    if (markBtn) {
      markBtn.disabled = true;
      fetch("/dashboard/pr/" + markBtn.getAttribute("data-pr-id") + "/mark-re-reviewed", {
        method: "POST",
      })
        .then(function (response) {
          if (!response.ok) throw new Error("request failed");
          window.location.reload();
        })
        .catch(function () {
          markBtn.disabled = false;
          markBtn.textContent = "Could not update. Try again.";
        });
      return;
    }

    var opener = event.target.closest("[data-rr-open]");
    if (opener) {
      var dialog = document.getElementById(opener.getAttribute("data-rr-open"));
      if (dialog) dialog.showModal();
      return;
    }
    var cancel = event.target.closest("[data-rr-cancel]");
    if (cancel) {
      var openDialog = cancel.closest("dialog");
      if (openDialog) openDialog.close();
    }
  });

  document.addEventListener("change", function (event) {
    if (!event.target.matches("[data-rr-all]")) return;
    var dialog = event.target.closest("dialog");
    if (!dialog) return;
    var boxes = dialog.querySelectorAll('input[name="reviewerIds"]');
    boxes.forEach(function (box) { box.checked = event.target.checked; });
  });

  document.addEventListener("submit", function (event) {
    var form = event.target.closest("[data-rr-form]");
    if (!form) return;
    event.preventDefault();

    var dialog = form.closest("dialog");
    var errorEl = form.querySelector("[data-rr-error]");
    var ids = Array.prototype.slice
      .call(form.querySelectorAll('input[name="reviewerIds"]:checked'))
      .map(function (input) { return input.value; });

    if (ids.length === 0) {
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    fetch("/dashboard/pr/" + dialog.getAttribute("data-pr-id") + "/request-re-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewerIds: ids }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("request failed");
        window.location.reload();
      })
      .catch(function () {
        errorEl.textContent = "Could not request re-review. Try again.";
        errorEl.hidden = false;
      });
  });
})();
</script>
</body>
</html>`;
}
