export type Intent = "upload" | "question" | "summary";

export type SourceType = "pdf" | "url" | "text";

export type SemanticMetadata = {
  entities: string[];
  relatedConcepts: string[];
  tags: string[];
};

export type ChunkRecord = {
  id: string;
  documentId: string;
  checksum: string;
  sourceName: string;
  sourceUrl?: string;
  sourceType: SourceType;
  sourcePath: string;
  extractedTextPath: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  entities: string[];
  relatedConcepts: string[];
  tags: string[];
  page?: number;
};

export type Citation = {
  sourceName: string;
  sourceUrl?: string;
  sourcePath: string;
  page?: number;
};

export type RetrievedChunk = ChunkRecord & {
  score: number;
};

export type IngestionInput =
  | {
      sourceType: "pdf";
      sourceName: string;
      sourceUrl?: string;
      fileBuffer: Buffer;
      text?: string;
    }
  | {
      sourceType: "url";
      sourceName: string;
      url: string;
      sourceUrl?: string;
    }
  | {
      sourceType: "text";
      sourceName: string;
      text: string;
      sourceUrl?: string;
    };

export type IngestionResult = {
  documentId: string;
  chunkCount: number;
  sourcePath: string;
  extractedTextPath: string;
  alreadyIndexed: boolean;
  checksum: string;
};
