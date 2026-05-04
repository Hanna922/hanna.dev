package com.hannadev.rag.api.dto;

import java.util.List;

public record RagQueryResponse(
	String context,
	List<SourceRef> sources,
	RetrievalMetadata retrieval
) {

	public record SourceRef(
		String docId,
		String title,
		String url,
		Double score,
		String locale,
		String sourceType
	) {
	}

	public record RetrievalMetadata(
		int topK,
		int returned,
		long tookMs
	) {
	}
}
