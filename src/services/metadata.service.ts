import { groqService } from "./groq.service";
import type { SemanticMetadata } from "../types";

const EMPTY_METADATA: SemanticMetadata = {
  entities: [],
  relatedConcepts: [],
  tags: [],
};

function uniqNormalized(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const set = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      set.add(normalized);
    }
  }
  return [...set];
}

function parseMetadataFromRaw(raw: string): SemanticMetadata | null {
  const candidates: string[] = [raw];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<SemanticMetadata>;
      return {
        entities: uniqNormalized(parsed.entities),
        relatedConcepts: uniqNormalized(parsed.relatedConcepts),
        tags: uniqNormalized(parsed.tags).map((tag) => tag.toLowerCase()),
      };
    } catch {
      // try next candidate
    }
  }

  return null;
}

function heuristicMetadata(text: string): SemanticMetadata {
  const entities = Array.from(
    new Set(
      (text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 2),
    ),
  ).slice(0, 12);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 5 &&
        ![
          "https",
          "which",
          "their",
          "there",
          "about",
          "would",
          "could",
          "should",
          "where",
          "while",
          "these",
          "those",
        ].includes(word),
    );

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  const relatedConcepts = ranked.slice(0, 10);
  const tags = relatedConcepts.slice(0, 8);

  return {
    entities,
    relatedConcepts,
    tags,
  };
}

export class MetadataService {
  async extractSemanticMetadata(text: string): Promise<SemanticMetadata> {
    if (!text.trim()) {
      return EMPTY_METADATA;
    }

    try {
      const raw = await groqService.extractMetadata(text);
      const parsed = parseMetadataFromRaw(raw);
      if (parsed) {
        const hasAny =
          parsed.entities.length > 0 ||
          parsed.relatedConcepts.length > 0 ||
          parsed.tags.length > 0;
        if (hasAny) {
          return parsed;
        }
      }
      return heuristicMetadata(text);
    } catch {
      return heuristicMetadata(text);
    }
  }
}

export const metadataService = new MetadataService();
