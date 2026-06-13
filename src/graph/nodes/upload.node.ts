import { ingestionService } from "../../services/ingestion.service";
import type { GraphState } from "../state";

export async function uploadNode(state: GraphState): Promise<GraphState> {
  if (!state.ingestionInput) {
    return state;
  }

  const result = await ingestionService.ingest(state.ingestionInput);
  const answer = result.alreadyIndexed
    ? `This file is already indexed. Reusing existing document ID: ${result.documentId}`
    : `Indexed ${state.ingestionInput.sourceName} (${result.chunkCount} chunks). Document ID: ${result.documentId}`;

  return {
    ...state,
    answer,
    citations: [result.sourcePath],
  };
}
