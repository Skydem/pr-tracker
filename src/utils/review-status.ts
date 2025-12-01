export const ReviewStatusEmoji = {
  APPROVED: ":white_check_mark:",
  CHANGES_REQUESTED: ":x:",
  PENDING: ":hourglass:",
} as const;

export function getStatusEmoji(status: string): string {
  return ReviewStatusEmoji[status as keyof typeof ReviewStatusEmoji] ?? ReviewStatusEmoji.PENDING;
}
