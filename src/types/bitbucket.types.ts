export interface BitbucketUser {
  display_name: string;
  uuid: string;
  nickname: string;
  type: string;
  account_id: string;
}

export interface BitbucketRepository {
  name: string;
  full_name: string;
  uuid: string;
  workspace: {
    slug: string;
    name: string;
    uuid: string;
  };
}

export interface BitbucketBranch {
  name: string;
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  description: string;
  state: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";
  source: {
    branch: BitbucketBranch;
    repository: BitbucketRepository;
  };
  destination: {
    branch: BitbucketBranch;
    repository: BitbucketRepository;
  };
  author: BitbucketUser;
  reviewers: BitbucketUser[];
  links: {
    html: {
      href: string;
    };
  };
  created_on: string;
  updated_on: string;
}

export interface BitbucketComment {
  id: number;
  content: {
    raw: string;
    markup: string;
    html: string;
  };
  user: BitbucketUser;
  created_on: string;
}

export interface BitbucketWebhookPayload {
  actor: BitbucketUser;
  repository: BitbucketRepository;
  pullrequest: BitbucketPullRequest;
}

export interface BitbucketApprovalPayload extends BitbucketWebhookPayload {
  approval: {
    date: string;
    user: BitbucketUser;
  };
}

export interface BitbucketChangesRequestPayload extends BitbucketWebhookPayload {
  changes_request: {
    date: string;
    user: BitbucketUser;
  };
}

export interface BitbucketCommentPayload extends BitbucketWebhookPayload {
  comment: BitbucketComment;
}

export type BitbucketEventType =
  | "pullrequest:created"
  | "pullrequest:updated"
  | "pullrequest:approved"
  | "pullrequest:unapproved"
  | "pullrequest:changes_request_created"
  | "pullrequest:changes_request_removed"
  | "pullrequest:comment_created"
  | "pullrequest:fulfilled"
  | "pullrequest:rejected";
