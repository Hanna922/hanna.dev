package com.hannadev.rag.embedding;

import java.util.List;

public interface EmbeddingService {

	List<Float> embedQuery(String query);

	List<List<Float>> embedDocuments(List<DocumentInput> documents);

	record DocumentInput(
		String title,
		String text
	) {
	}
}
