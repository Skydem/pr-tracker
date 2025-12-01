export interface PRIdentifier {
  workspaceSlug: string;
  repositorySlug: string;
  prId: number;
}

export type ParseResult =
  | { success: true; data: PRIdentifier }
  | { success: false; error: string };

export function parsePRIdentifier(identifier: string): ParseResult {
  if (!identifier) {
    return { success: false, error: "PR identifier is required" };
  }

  const parts = identifier.split("/");
  if (parts.length !== 3) {
    return { success: false, error: "Invalid format. Use: `workspace/repo/pr-id`" };
  }

  const [workspaceSlug, repositorySlug, prIdStr] = parts;
  const prId = parseInt(prIdStr, 10);

  if (isNaN(prId)) {
    return { success: false, error: "Invalid PR ID. Must be a number." };
  }

  return {
    success: true,
    data: { workspaceSlug, repositorySlug, prId },
  };
}
