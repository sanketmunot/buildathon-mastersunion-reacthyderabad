import { lanceDbService } from "./lancedb";
import type { ChunkRecord, RetrievedChunk } from "../types";

export class DocumentsDb {
  private initialized = false;

  async init(): Promise<void> {
    if (!this.initialized) {
      await lanceDbService.init();
      this.initialized = true;
    }
  }

  async addChunks(rows: ChunkRecord[]): Promise<void> {
    await this.init();
    await lanceDbService.add(rows);
  }

  async similaritySearch(queryEmbedding: number[], topK: number): Promise<RetrievedChunk[]> {
    await this.init();
    const rows = await lanceDbService.similaritySearch(queryEmbedding, topK);
    return rows;
  }

  async findByDocumentId(documentId: string): Promise<ChunkRecord[]> {
    await this.init();
    const rows = await lanceDbService.allRows();
    return rows.filter((row) => row.documentId === documentId);
  }

  async findByChecksum(checksum: string): Promise<ChunkRecord | null> {
    await this.init();
    const rows = await lanceDbService.allRows();
    return rows.find((row) => row.checksum === checksum) ?? null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<ChunkRecord | null> {
    await this.init();
    const rows = await lanceDbService.allRows();
    return rows.find((row) => row.sourceUrl === sourceUrl) ?? null;
  }

  async findRelatedByMetadata(params: {
    tags: string[];
    relatedConcepts: string[];
    limit: number;
    excludeIds: string[];
  }): Promise<ChunkRecord[]> {
    await this.init();
    const rows = await lanceDbService.allRows();
    const tagSet = new Set(params.tags.map((t) => t.toLowerCase()));
    const conceptSet = new Set(params.relatedConcepts.map((c) => c.toLowerCase()));
    const exclude = new Set(params.excludeIds);

    const scored = rows
      .filter((row) => !exclude.has(row.id))
      .map((row) => {
        const tagsHit = row.tags.filter((t) => tagSet.has(t.toLowerCase())).length;
        const conceptsHit = row.relatedConcepts.filter((c) =>
          conceptSet.has(c.toLowerCase()),
        ).length;
        return { row, score: tagsHit + conceptsHit };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, params.limit)
      .map((entry) => entry.row);

    return scored;
  }
}

export const documentsDb = new DocumentsDb();
