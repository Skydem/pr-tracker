import type { PRWithReviewers } from "./pr.service.js";
import { notificationService } from "./notification.service.js";

const DEBOUNCE_WINDOW_MS = 10_000;

interface BufferedComment {
  pr: PRWithReviewers;
  commenterUuid: string;
  commenterName: string;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

export class CommentDebouncerService {
  private buffer = new Map<string, BufferedComment>();

  bufferComment(
    pr: PRWithReviewers,
    commenterUuid: string,
    commenterName: string
  ): void {
    const key = `${pr.id}:${commenterUuid}`;
    const existing = this.buffer.get(key);

    if (existing) {
      clearTimeout(existing.timer);
      existing.count++;
      existing.timer = setTimeout(() => this.flush(key), DEBOUNCE_WINDOW_MS);
      return;
    }

    const timer = setTimeout(() => this.flush(key), DEBOUNCE_WINDOW_MS);
    this.buffer.set(key, { pr, commenterUuid, commenterName, count: 1, timer });
  }

  private async flush(key: string): Promise<void> {
    const entry = this.buffer.get(key);
    if (!entry) return;
    this.buffer.delete(key);

    try {
      if (entry.count === 1) {
        await notificationService.notifyAuthorOnComment(
          entry.pr,
          entry.commenterUuid,
          entry.commenterName
        );
      } else {
        await notificationService.notifyAuthorOnBatchedComments(
          entry.pr,
          entry.commenterUuid,
          entry.commenterName,
          entry.count
        );
      }
    } catch (error) {
      console.error(`[CommentDebouncer] Failed to flush notification for key ${key}:`, error);
    }
  }

  get pendingCount(): number {
    return this.buffer.size;
  }
}

export const commentDebouncer = new CommentDebouncerService();
