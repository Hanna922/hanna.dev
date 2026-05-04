package com.hannadev.rag.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.hannadev.rag.api.dto.RagDocumentDto;
import java.util.List;
import org.junit.jupiter.api.Test;

class ContentHashServiceTest {

	private final ContentHashService contentHashService = new ContentHashService();

	@Test
	void sameCanonicalDocumentProducesSameHash() {
		var document = document(
			"doc-1",
			"Original title",
			"Original description",
			List.of("rag", "portfolio"),
			"Original body"
		);

		var firstHash = this.contentHashService.hash(document);
		var secondHash = this.contentHashService.hash(document);

		assertEquals(firstHash, secondHash);
	}

	@Test
	void contentChangeProducesNewHash() {
		var original = document(
			"doc-1",
			"Original title",
			"Original description",
			List.of("rag", "portfolio"),
			"Original body"
		);
		var changed = document(
			"doc-1",
			"Original title",
			"Original description",
			List.of("rag", "portfolio"),
			"Updated body"
		);

		assertNotEquals(
			this.contentHashService.hash(original),
			this.contentHashService.hash(changed)
		);
	}

	@Test
	void retrievalMetadataChangeProducesNewHash() {
		var original = document(
			"doc-1",
			"Original title",
			"Original description",
			List.of("rag", "portfolio"),
			"Original body"
		);
		var changedMetadata = document(
			"doc-1",
			"Updated title",
			"Original description",
			List.of("rag", "portfolio"),
			"Original body"
		);

		assertNotEquals(
			this.contentHashService.hash(original),
			this.contentHashService.hash(changedMetadata)
		);
	}

	private RagDocumentDto document(
		String docId,
		String title,
		String description,
		List<String> tags,
		String fullText
	) {
		return new RagDocumentDto(
			docId,
			"base-" + docId,
			"ko",
			title,
			"English title",
			description,
			"https://hanna.dev/" + docId,
			tags,
			"blog",
			"2026-04-03T00:00:00Z",
			fullText
		);
	}
}
