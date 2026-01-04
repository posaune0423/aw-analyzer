import { describe, expect, mock, test } from "bun:test";

import { shareSlackFilePublicly, uploadSlackFile } from "../src/libs/slack-file-upload.ts";

describe("uploadSlackFile", () => {
  test("uses getUploadURLExternal -> upload_url -> completeUploadExternal flow", async () => {
    const fetchFn = mock(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);

      if (u === "https://slack.com/api/files.getUploadURLExternal") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ ok: true, upload_url: "https://upload.example.com", file_id: "F123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (u === "https://upload.example.com") {
        expect(init?.method).toBe("POST");
        return new Response("", { status: 200 });
      }

      if (u === "https://slack.com/api/files.completeUploadExternal") {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({ ok: true, files: [{ id: "F123", permalink: "https://slack.example.com/f/1" }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ ok: false, error: "unexpected_url" }), { status: 500 });
    }) as unknown as typeof fetch;

    const result = await uploadSlackFile(
      { botToken: "xoxb-test", channelId: "C123" },
      { filename: "test.svg", mimeType: "image/svg+xml", content: "<svg/>" },
      { fetchFn },
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.fileId).toBe("F123");
      expect(result.value.permalink).toBe("https://slack.example.com/f/1");
    }
  });

  test("can share uploaded file publicly (files.sharedPublicURL)", async () => {
    const fetchFn = mock(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);

      if (u === "https://slack.com/api/files.sharedPublicURL") {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({ ok: true, file: { id: "F123", permalink_public: "https://slack.example.com/p/1" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ ok: false, error: "unexpected_url" }), { status: 500 });
    }) as unknown as typeof fetch;

    const result = await shareSlackFilePublicly(
      { botToken: "xoxb-test", channelId: "C123" },
      { fileId: "F123" },
      { fetchFn },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.permalinkPublic).toBe("https://slack.example.com/p/1");
    }
  });
});
