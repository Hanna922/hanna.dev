package com.hannadev.rag.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class LocaleResolverTest {

	private final LocaleResolver localeResolver = new LocaleResolver();

	@Test
	void returnsPrimaryAndFallbackLocalesForKoRequests() {
		assertEquals(List.of("ko", "neutral"), this.localeResolver.primaryLocales("ko"));
		assertEquals(List.of("en"), this.localeResolver.fallbackLocales("ko"));
	}

	@Test
	void deduplicatesBaseSlugInFavorOfRequestedLocale() {
		var results = this.localeResolver.merge(
			List.of(
				result("shared-project-neutral", "shared-project", "neutral", 0.91d),
				result("shared-project-ko", "shared-project", "ko", 0.82d),
				result("standalone-project", "standalone-project", "ko", 0.77d)
			),
			List.of(),
			"ko",
			5
		);

		assertEquals(2, results.size());
		assertEquals("shared-project-ko", results.get(0).docId());
		assertEquals("ko", results.get(0).locale());
		assertEquals("standalone-project", results.get(1).docId());
	}

	private QdrantDocumentRepository.SearchResult result(
		String docId,
		String baseSlug,
		String locale,
		double score
	) {
		return new QdrantDocumentRepository.SearchResult(
			docId,
			baseSlug,
			locale,
			"Title " + docId,
			"English " + docId,
			"Description " + docId,
			"https://hanna.dev/" + docId,
			List.of("rag"),
			"blog",
			"2026-04-03T00:00:00Z",
			"hash-" + docId,
			"Full text for " + docId,
			score
		);
	}
}
