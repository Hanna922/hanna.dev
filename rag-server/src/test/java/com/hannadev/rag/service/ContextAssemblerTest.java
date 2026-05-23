package com.hannadev.rag.service;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class ContextAssemblerTest {

	@Test
	void respectsPerSourceAndTotalCharacterCaps() {
		var assembler = new ContextAssembler(220, 60);
		var context = assembler.assemble(List.of(
			result("doc-1", "A".repeat(120) + "TAIL-1"),
			result("doc-2", "B".repeat(120) + "TAIL-2")
		), "ko");

		assertTrue(context.contains("[Source 1]"));
		assertTrue(context.contains("[Source 2]"));
		assertTrue(context.length() <= 220);
		assertTrue(!context.contains("TAIL-1"));
		assertTrue(!context.contains("TAIL-2"));
	}

	private QdrantDocumentRepository.SearchResult result(String docId, String fullText) {
		return new QdrantDocumentRepository.SearchResult(
			docId,
			docId,
			"ko",
			"Title " + docId,
			"English " + docId,
			"Description " + docId,
			"https://hanna.dev/" + docId,
			List.of("rag"),
			"blog",
			"2026-04-03T00:00:00Z",
			"hash-" + docId,
			fullText,
			0.8d
		);
	}
}
