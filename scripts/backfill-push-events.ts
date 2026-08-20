import { prisma } from "../src/db/client.js";
import { bitbucketApiService } from "../src/services/bitbucket-api.service.js";

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  if (!bitbucketApiService.isConfigured()) {
    console.error(
      "Bitbucket API not configured. Set BITBUCKET_WORKSPACE, BITBUCKET_EMAIL, BITBUCKET_API_TOKEN, BITBUCKET_REPOS."
    );
    process.exit(1);
  }

  const openPRs = await prisma.pullRequest.findMany({
    where: { state: "OPEN" },
    include: {
      events: { select: { eventType: true } },
    },
    orderBy: { bitbucketId: "asc" },
  });

  console.log(
    `${openPRs.length} open PRs${dryRun ? " (dry run, nothing will be written)" : ""}\n`
  );

  let hashesStored = 0;
  let eventsCreated = 0;
  let skipped = 0;

  for (const pr of openPRs) {
    const label = `${pr.repositorySlug}#${pr.bitbucketId}`;

    try {
      const remote = await bitbucketApiService.getPullRequest(
        pr.repositorySlug,
        pr.bitbucketId
      );
      const hash = remote.source.commit?.hash ?? null;

      if (hash !== null && hash !== pr.sourceCommitHash) {
        if (!dryRun) {
          await prisma.pullRequest.update({
            where: { id: pr.id },
            data: { sourceCommitHash: hash },
          });
        }
        hashesStored += 1;
      }

      if (pr.events.some((event) => event.eventType === "PR_COMMITS_PUSHED")) {
        skipped += 1;
        continue;
      }

      const latestCommit = await bitbucketApiService.getLatestCommit(
        pr.repositorySlug,
        pr.bitbucketId
      );

      if (latestCommit === null) {
        console.log(`${label}: no commits, skipped`);
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await prisma.pREvent.create({
          data: {
            pullRequestId: pr.id,
            eventType: "PR_COMMITS_PUSHED",
            actorId: pr.authorId,
            createdAt: latestCommit.date,
            payload: { backfilled: true, to: latestCommit.hash },
          },
        });
      }
      eventsCreated += 1;
      console.log(
        `${label}: push event at ${latestCommit.date.toISOString()} (${latestCommit.hash.slice(0, 8)})`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`${label}: failed - ${message}`);
    }
  }

  console.log(
    `\nStored ${hashesStored} commit hashes, created ${eventsCreated} push events, skipped ${skipped}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
