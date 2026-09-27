import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJiraIssue } from "./shared";

const ORIGINAL_ENV = process.env;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createJiraIssue", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      JIRA_BASE_URL: "https://tasklaunch-test.atlassian.net",
      JIRA_PROJECT_KEY: "TLAPP",
      JIRA_EMAIL: "feedback@example.com",
      JIRA_API_TOKEN: "test-token",
      JIRA_ISSUE_TYPE_BUG: "Bug",
      JIRA_ISSUE_TYPE_DEFAULT: "Task",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = ORIGINAL_ENV;
  });

  it("adds actionable context to localized Jira project and permission failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ issues: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            errorMessages: ["目标项目不存在，或者您无权在该项目中创建事务。"],
          },
          400
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createJiraIssue({
        uid: "uid-1",
        type: "bug",
        title: "Feedback title",
        details: "Feedback details",
        isAnonymous: false,
        authorEmail: "user@example.com",
        authorDisplayName: "User",
      })
    ).rejects.toThrow(
      "Jira issue creation failed (HTTP 400, project TLAPP, issue type Bug): 目标项目不存在，或者您无权在该项目中创建事务。 Check JIRA_PROJECT_KEY, JIRA_ISSUE_TYPE_* values, the Jira API token, and Create issues permission."
    );

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://tasklaunch-test.atlassian.net/rest/api/3/issue",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Language": "en-US",
        }),
      })
    );
  });

  it("points authentication failures at Jira credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          errorMessages: ["Unauthorized"],
        },
        401
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createJiraIssue({
        uid: "uid-1",
        type: "bug",
        title: "Feedback title",
        details: "Feedback details",
        isAnonymous: false,
        authorEmail: "user@example.com",
        authorDisplayName: "User",
      })
    ).rejects.toThrow(
      "Jira duplicate feedback search failed (HTTP 401, project TLAPP): Unauthorized Check JIRA_EMAIL and JIRA_API_TOKEN."
    );
  });
});
