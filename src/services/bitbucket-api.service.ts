import { config } from "../config/env.js";
import type { BitbucketPullRequest } from "../types/bitbucket.types.js";

interface BitbucketPaginatedResponse<T> {
  values: T[];
  next?: string;
  page?: number;
  size?: number;
}

class BitbucketApiService {
  private baseUrl = "https://api.bitbucket.org/2.0";

  private getAuthHeader(): string {
    const credentials = `${config.bitbucket.email}:${config.bitbucket.apiToken}`;
    return `Basic ${Buffer.from(credentials).toString("base64")}`;
  }

  isConfigured(): boolean {
    return !!(
      config.bitbucket.workspace &&
      config.bitbucket.email &&
      config.bitbucket.apiToken &&
      config.bitbucket.repos.length > 0
    );
  }

  async getPullRequests(repoSlug: string): Promise<BitbucketPullRequest[]> {
    const prIds: number[] = [];
    let url: string | null =
      `${this.baseUrl}/repositories/${config.bitbucket.workspace}/${repoSlug}/pullrequests?state=OPEN&pagelen=50`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: this.getAuthHeader(),
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Bitbucket API error: ${response.status} ${response.statusText}`
        );
      }

      const data =
        (await response.json()) as BitbucketPaginatedResponse<{ id: number }>;
      prIds.push(...data.values.map((pr) => pr.id));
      url = data.next ?? null;
    }

    const allPRs: BitbucketPullRequest[] = [];
    for (const prId of prIds) {
      const pr = await this.getPullRequest(repoSlug, prId);
      allPRs.push(pr);
    }

    return allPRs;
  }

  async getPullRequest(repoSlug: string, prId: number): Promise<BitbucketPullRequest> {
    const url = `${this.baseUrl}/repositories/${config.bitbucket.workspace}/${repoSlug}/pullrequests/${prId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: this.getAuthHeader(),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Bitbucket API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as BitbucketPullRequest;
  }
}

export const bitbucketApiService = new BitbucketApiService();
