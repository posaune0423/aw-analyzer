/**
 * Slack file upload (Web API)
 *
 * Incoming Webhooks cannot upload files. This module uses Slack Web API
 * with a Bot token to upload an SVG (or other file) to a channel.
 *
 * Notes:
 * - Requires a Slack Bot token with `files:write` scope and channel access.
 * - Uses `files.getUploadURLExternal` + `files.completeUploadExternal` (recommended flow).
 */

import { err, ok, type Result } from "neverthrow";

import { logger } from "../utils/logger.ts";

export type SlackFileUploadError =
  | { type: "config_error"; message: string }
  | { type: "api_error"; message: string }
  | { type: "http_error"; message: string };

export type SlackFileUploadConfig = {
  botToken: string;
  channelId?: string; // Optional: if provided, file will be shared to channel automatically
};

export type SlackFileUploadInput = {
  filename: string;
  title?: string;
  initialComment?: string;
  mimeType: string;
  content: string | Uint8Array;
};

type SlackGetUploadUrlExternalResponse = {
  ok: boolean;
  error?: string;
  upload_url?: string;
  file_id?: string;
  response_metadata?: { messages?: string[] };
};

type SlackCompleteUploadExternalResponse = {
  ok: boolean;
  error?: string;
  files?: Array<{ id?: string; permalink?: string; permalink_public?: string }>;
  response_metadata?: { messages?: string[] };
};

type SlackSharedPublicUrlResponse = {
  ok: boolean;
  error?: string;
  file?: { id?: string; permalink_public?: string };
  response_metadata?: { messages?: string[] };
};

type SlackFileInfoResponse = {
  ok: boolean;
  error?: string;
  file?: {
    id?: string;
    permalink?: string;
    permalink_public?: string;
    url_private?: string;
  };
  response_metadata?: { messages?: string[] };
};

export type UploadSlackFileDeps = {
  fetchFn?: typeof fetch;
};

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

function formatSlackApiError(payload: { error?: string; response_metadata?: { messages?: string[] } }): string {
  const base = payload.error ?? "Slack API error";
  const details = payload.response_metadata?.messages?.filter(Boolean).join(" | ");
  return details ? `${base}: ${details}` : base;
}

function asFormBody(fields: Record<string, string | number | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    body.set(k, String(v));
  }
  return body;
}

export async function uploadSlackFile(
  config: SlackFileUploadConfig,
  input: SlackFileUploadInput,
  deps: UploadSlackFileDeps = {},
): Promise<Result<{ permalink?: string; fileId?: string; permalinkPublic?: string }, SlackFileUploadError>> {
  if (!config.botToken) return err({ type: "config_error", message: "Slack bot token is not configured" });

  const fetchFn = deps.fetchFn ?? fetch;

  const bytes = toBytes(input.content);

  // 1) Get upload URL
  const getUrlRes = await fetchFn("https://slack.com/api/files.getUploadURLExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: asFormBody({ filename: input.filename, length: bytes.byteLength }),
  });

  if (!getUrlRes.ok) {
    const text = await getUrlRes.text().catch(() => "");
    return err({ type: "http_error", message: `HTTP ${getUrlRes.status}: ${text}` });
  }

  const getUrlJson = (await getUrlRes.json()) as SlackGetUploadUrlExternalResponse;
  if (!getUrlJson.ok) {
    return err({ type: "api_error", message: `files.getUploadURLExternal: ${formatSlackApiError(getUrlJson)}` });
  }

  const uploadUrl = getUrlJson.upload_url;
  const fileId = getUrlJson.file_id;
  if (!uploadUrl || !fileId) {
    return err({ type: "api_error", message: "Missing upload_url or file_id" });
  }

  // 2) Upload the file bytes to the returned upload URL (no Slack auth header)
  const uploadForm = new FormData();
  uploadForm.append("file", new Blob([bytes], { type: input.mimeType }), input.filename);
  uploadForm.append("filename", input.filename);

  const uploadRes = await fetchFn(uploadUrl, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    return err({ type: "http_error", message: `Upload failed HTTP ${uploadRes.status}: ${text}` });
  }

  // 3) Finalize upload (optionally share into channel)
  const completeBody: Record<string, string | number | undefined> = {
    // Slack expects "files" as a JSON string in form-encoded requests.
    files: JSON.stringify([{ id: fileId, title: input.title ?? input.filename }]),
  };
  // Only include channel_id if provided (this will share the file to the channel)
  if (config.channelId) {
    completeBody.channel_id = config.channelId;
  }
  // Include initial_comment if provided (used as the message text when sharing to a channel)
  if (input.initialComment && input.initialComment.trim() !== "") {
    completeBody.initial_comment = input.initialComment;
  }

  const completeRes = await fetchFn("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: asFormBody(completeBody),
  });

  if (!completeRes.ok) {
    const text = await completeRes.text().catch(() => "");
    return err({ type: "http_error", message: `HTTP ${completeRes.status}: ${text}` });
  }

  const completeJson = (await completeRes.json()) as SlackCompleteUploadExternalResponse;
  if (!completeJson.ok) {
    return err({ type: "api_error", message: `files.completeUploadExternal: ${formatSlackApiError(completeJson)}` });
  }

  const file = completeJson.files?.[0];
  const permalink = file?.permalink;
  const permalinkPublic = file?.permalink_public;
  if (permalinkPublic) {
    logger.debug("Public URL obtained directly from files.completeUploadExternal");
  }
  return ok({ permalink, fileId, permalinkPublic });
}

export async function getSlackFileInfo(
  config: SlackFileUploadConfig,
  input: { fileId: string },
  deps: UploadSlackFileDeps = {},
): Promise<Result<{ permalinkPublic?: string }, SlackFileUploadError>> {
  if (!config.botToken) return err({ type: "config_error", message: "Slack bot token is not configured" });
  if (!input.fileId) return err({ type: "config_error", message: "fileId is required" });

  const fetchFn = deps.fetchFn ?? fetch;

  const res = await fetchFn("https://slack.com/api/files.info", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: asFormBody({ file: input.fileId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return err({ type: "http_error", message: `HTTP ${res.status}: ${text}` });
  }

  const json = (await res.json()) as SlackFileInfoResponse;
  if (!json.ok) {
    return err({ type: "api_error", message: `files.info: ${formatSlackApiError(json)}` });
  }

  return ok({ permalinkPublic: json.file?.permalink_public });
}

export async function shareSlackFilePublicly(
  config: SlackFileUploadConfig,
  input: { fileId: string },
  deps: UploadSlackFileDeps = {},
): Promise<Result<{ permalinkPublic?: string }, SlackFileUploadError>> {
  if (!config.botToken) return err({ type: "config_error", message: "Slack bot token is not configured" });
  if (!input.fileId) return err({ type: "config_error", message: "fileId is required" });

  const fetchFn = deps.fetchFn ?? fetch;

  // First, try to share publicly
  const shareRes = await fetchFn("https://slack.com/api/files.sharedPublicURL", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: asFormBody({ file: input.fileId }),
  });

  if (shareRes.ok) {
    const shareJson = (await shareRes.json()) as SlackSharedPublicUrlResponse;
    if (shareJson.ok && shareJson.file?.permalink_public) {
      logger.debug("Successfully obtained public URL via files.sharedPublicURL");
      return ok({ permalinkPublic: shareJson.file.permalink_public });
    }
    // If shareRes.ok but shareJson.ok is false, log the error but continue to try files.info
    if (!shareJson.ok) {
      const errorMsg = formatSlackApiError(shareJson);
      logger.debug(`files.sharedPublicURL failed: ${errorMsg}, trying files.info as fallback`);
    }
  } else {
    const text = await shareRes.text().catch(() => "");
    logger.debug(`files.sharedPublicURL HTTP error ${shareRes.status}: ${text}, trying files.info as fallback`);
  }

  // If sharing failed, try to get file info (file might already be public)
  const infoRes = await fetchFn("https://slack.com/api/files.info", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: asFormBody({ file: input.fileId }),
  });

  if (!infoRes.ok) {
    const errorText = await infoRes.text().catch(() => "");
    logger.warn("Failed to get file info", { status: infoRes.status, error: errorText });
    // Return ok with undefined instead of error - caller can handle gracefully
    return ok({ permalinkPublic: undefined });
  }

  const infoJson = (await infoRes.json()) as SlackFileInfoResponse;
  if (!infoJson.ok) {
    // Return ok with undefined instead of error - caller can handle gracefully
    return ok({ permalinkPublic: undefined });
  }

  // Return permalink_public if available
  if (infoJson.file?.permalink_public) {
    logger.debug("Successfully obtained public URL via files.info");
    return ok({ permalinkPublic: infoJson.file.permalink_public });
  }

  // If still no public URL, return ok with undefined (not an error)
  logger.debug("Could not obtain public URL from files.info, file may not be publicly shareable");
  return ok({ permalinkPublic: undefined });
}
