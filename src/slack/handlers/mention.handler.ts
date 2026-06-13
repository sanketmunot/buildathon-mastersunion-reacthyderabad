import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { ACK_INDEXING, ACK_SEARCHING } from "../../config/constants";
import { runWorkflow } from "../../graph/workflow";

type MentionArgs = SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs;

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s>|]+/i);
  return match?.[0] ?? null;
}

function sourceNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/^\/+/, "");
    if (pathname) {
      return `${parsed.hostname}-${pathname.replace(/[^\w.-]+/g, "_")}`;
    }
    return `${parsed.hostname}-page`;
  } catch {
    return "url-source";
  }
}

export async function handleMention(args: MentionArgs): Promise<void> {
  const { event, say } = args;
  const maybeFileShareEvent = event as typeof event & {
    subtype?: string;
    files?: unknown[];
  };

  // Slack may emit app_mention with file_share context. Let file_shared handler own indexing.
  if (
    maybeFileShareEvent.subtype === "file_share" ||
    (maybeFileShareEvent.files?.length ?? 0) > 0
  ) {
    // eslint-disable-next-line no-console
    console.log("[mention] skipping file_share-style mention event");
    return;
  }

  const question = event.text ?? "";
  const threadTs = event.thread_ts ?? event.ts;
  const isMainMessage = !event.thread_ts;
  const firstUrl = extractFirstUrl(question);
  const shouldIngestUrl = isMainMessage && !!firstUrl;
  // eslint-disable-next-line no-console
  console.log(
    `[mention] start threadTs=${threadTs} shouldIngestUrl=${shouldIngestUrl}`,
  );

  await say({
    text: shouldIngestUrl ? ACK_INDEXING : ACK_SEARCHING,
    thread_ts: threadTs,
  });
  // eslint-disable-next-line no-console
  console.log(`[mention] ack sent threadTs=${threadTs}`);

  setImmediate(async () => {
    try {
      // eslint-disable-next-line no-console
      console.log(`[mention] workflow begin threadTs=${threadTs}`);
      const result = shouldIngestUrl
        ? await runWorkflow({
            userMessage: `upload ${sourceNameFromUrl(firstUrl ?? "")}`,
            threadTs,
            ingestionInput: {
              sourceType: "url",
              sourceName: sourceNameFromUrl(firstUrl ?? ""),
              sourceUrl: firstUrl ?? undefined,
              url: firstUrl ?? "",
            },
          })
        : await runWorkflow({
            userMessage: question,
            threadTs,
          });

      await say({
        text: result.answer ?? "Unable to process request.",
        thread_ts: threadTs,
      });
      // eslint-disable-next-line no-console
      console.log(`[mention] response sent threadTs=${threadTs}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[mention] error threadTs=${threadTs}`, error);
      await say({
        text: `Error processing request: ${(error as Error).message}`,
        thread_ts: threadTs,
      });
    }
  });
}
