import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import { documentsDb } from "../db/documents.db";
import { parseDocx } from "../parsers/docx";
import { parsePdf } from "../parsers/pdf";
import { parseText, parseTxtFile } from "../parsers/text";
import { parseUrl } from "../parsers/url";
import { chunkText } from "../rag/chunk";
import { embedText } from "../rag/embed";
import { metadataService } from "./metadata.service";
import { StorageService } from "./storage.service";
import type { ChunkRecord, IngestionInput, IngestionResult, SourceType } from "../types";

const URL_INGESTION_TIMEOUT_MS = 60_000;

export class IngestionService {
  constructor(private readonly storageService = new StorageService()) {}

  private computeChecksum(content: Buffer | string): string {
    const value = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    return createHash("sha256").update(value).digest("hex");
  }

  private assertWithinDeadline(deadlineMs?: number): void {
    if (deadlineMs && Date.now() > deadlineMs) {
      throw new Error("URL ingestion timed out after 60 seconds.");
    }
  }

  private async getExtractedText(
    input: IngestionInput,
    deadlineMs?: number,
  ): Promise<string> {
    if (input.sourceType === "pdf") {
      if (input.text) {
        return parseText(input.text);
      }
      return parsePdf(input.fileBuffer);
    }
    if (input.sourceType === "docx") {
      return parseDocx(input.fileBuffer);
    }
    if (input.sourceType === "txt") {
      return parseTxtFile(input.fileBuffer);
    }
    if (input.sourceType === "url") {
      const remainingMs = Math.max(1_000, (deadlineMs ?? Date.now() + 55_000) - Date.now());
      return parseUrl(input.url, remainingMs);
    }
    return parseText(input.text);
  }

  async ingest(input: IngestionInput): Promise<IngestionResult> {
    const deadlineMs =
      input.sourceType === "url" ? Date.now() + URL_INGESTION_TIMEOUT_MS : undefined;
    const sourceContent =
      input.sourceType === "pdf" || input.sourceType === "docx" || input.sourceType === "txt"
        ? input.fileBuffer
        : input.sourceType === "url"
          ? input.url
          : input.text;
    const checksum = this.computeChecksum(sourceContent);
    this.assertWithinDeadline(deadlineMs);

    const existingByUrl = input.sourceUrl
      ? await documentsDb.findBySourceUrl(input.sourceUrl)
      : null;
    if (existingByUrl) {
      return {
        documentId: existingByUrl.documentId,
        chunkCount: 0,
        sourcePath: existingByUrl.sourcePath,
        extractedTextPath: existingByUrl.extractedTextPath,
        alreadyIndexed: true,
        checksum,
      };
    }
    this.assertWithinDeadline(deadlineMs);

    const existing = await documentsDb.findByChecksum(checksum);
    if (existing) {
      return {
        documentId: existing.documentId,
        chunkCount: 0,
        sourcePath: existing.sourcePath,
        extractedTextPath: existing.extractedTextPath,
        alreadyIndexed: true,
        checksum,
      };
    }
    this.assertWithinDeadline(deadlineMs);

    const extractedText = await this.getExtractedText(input, deadlineMs);
    this.assertWithinDeadline(deadlineMs);
    const metadata = await metadataService.extractSemanticMetadata(extractedText);
    this.assertWithinDeadline(deadlineMs);

    const persisted = await this.storageService.persistArtifacts({
      sourceName: input.sourceName,
      sourceContent,
      extractedText,
      metadata,
    });

    const chunks = chunkText({ text: extractedText });
    const documentId = uuidv4();
    const rows: ChunkRecord[] = [];

    for (let i = 0; i < chunks.length; i += 1) {
      this.assertWithinDeadline(deadlineMs);
      const chunk = chunks[i];
      const embedding = await embedText(chunk);
      rows.push({
        id: uuidv4(),
        documentId,
        checksum,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType as SourceType,
        sourcePath: persisted.sourcePath,
        extractedTextPath: persisted.extractedTextPath,
        chunkIndex: i,
        chunkText: chunk,
        embedding,
        entities: metadata.entities,
        relatedConcepts: metadata.relatedConcepts,
        tags: metadata.tags,
      });
    }

    await documentsDb.addChunks(rows);

    return {
      documentId,
      chunkCount: rows.length,
      sourcePath: persisted.sourcePath,
      extractedTextPath: persisted.extractedTextPath,
      alreadyIndexed: false,
      checksum,
    };
  }
}

export const ingestionService = new IngestionService();
