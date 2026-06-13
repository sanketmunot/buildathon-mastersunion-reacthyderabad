import axios from "axios";
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { ACK_INDEXING } from "../../config/constants";
import { env } from "../../config/env";
import { runWorkflow } from "../../graph/workflow";
import type { IngestionInput } from "../../types";

type FileSharedArgs = SlackEventMiddlewareArgs<"file_shared"> & AllMiddlewareArgs;

type SlackFile = {
  id: string;
  name: string;
  mimetype?: string;
  url_private_download?: string;
  permalink?: string;
};

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function isPdf(file: SlackFile): boolean {
  return file.mimetype === "application/pdf" || getFileExtension(file.name) === "pdf";
}

function isDocx(file: SlackFile): boolean {
  return (
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    getFileExtension(file.name) === "docx"
  );
}

function isTxt(file: SlackFile): boolean {
  return file.mimetype?.startsWith("text/") === true || getFileExtension(file.name) === "txt";
}

function buildIngestionInputFromFile(file: SlackFile, fileBuffer: Buffer): IngestionInput {
  const sourceName = file.name ?? `${file.id}.bin`;
  if (isPdf(file)) {
    return {
      sourceType: "pdf",
      sourceName,
      sourceUrl: file.permalink,
      fileBuffer,
    };
  }
  if (isDocx(file)) {
    return {
      sourceType: "docx",
      sourceName,
      sourceUrl: file.permalink,
      fileBuffer,
    };
  }
  if (isTxt(file)) {
    return {
      sourceType: "txt",
      sourceName,
      sourceUrl: file.permalink,
      fileBuffer,
    };
  }
  throw new Error("Unsupported file type. Supported: .pdf, .docx, .txt");
}

async function downloadSlackFile(file: SlackFile): Promise<Buffer> {
  if (!file.url_private_download) {
    throw new Error("Missing file download URL.");
  }
  const response = await axios.get<ArrayBuffer>(file.url_private_download, {
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
  });
  return Buffer.from(response.data);
}

export async function handleFileShared(args: FileSharedArgs): Promise<void> {
  const { event, client } = args;
  // eslint-disable-next-line no-console
  console.log(`[upload] start fileId=${event.file_id}`);
  const fileInfo = await client.files.info({ file: event.file_id });
  const file = fileInfo.file as SlackFile | undefined;
  if (!file) {
    // eslint-disable-next-line no-console
    console.warn(`[upload] file missing for fileId=${event.file_id}`);
    return;
  }

  const channels = (fileInfo.file as any)?.channels as string[] | undefined;
  const channel = channels?.[0];
  if (!channel) {
    // eslint-disable-next-line no-console
    console.warn(`[upload] no channel found file=${file.name}`);
    return;
  }

  await client.chat.postMessage({
    channel,
    text: ACK_INDEXING,
  });
  // eslint-disable-next-line no-console
  console.log(`[upload] ack sent file=${file.name}`);

  setImmediate(async () => {
    try {
      // eslint-disable-next-line no-console
      console.log(`[upload] workflow begin file=${file.name}`);
      const buffer = await downloadSlackFile(file);
      const ingestionInput = buildIngestionInputFromFile(file, buffer);
      const result = await runWorkflow({
        userMessage: `upload ${file.name}`,
        threadTs: `${Date.now()}`,
        ingestionInput,
      });

      await client.chat.postMessage({
        channel,
        text: result.answer ?? `Indexed ${file.name}`,
      });
      // eslint-disable-next-line no-console
      console.log(`[upload] workflow done file=${file.name}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[upload] workflow failed file=${file.name}`, error);
      await client.chat.postMessage({
        channel,
        text: `Failed to index file: ${(error as Error).message}`,
      });
    }
  });
}
