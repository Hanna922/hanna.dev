package com.hannadev.rag.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.hannadev.rag.api.dto.RagQueryRequest;
import com.hannadev.rag.config.QdrantProperties;
import com.hannadev.rag.embedding.EmbeddingService;
import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import com.hannadev.rag.qdrant.QdrantFilterFactory;
import com.hannadev.rag.qdrant.QdrantGateway;
import com.hannadev.rag.qdrant.QdrantPayloadMapper;
import io.qdrant.client.grpc.Common;
import io.qdrant.client.grpc.Points;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class RagQueryServiceTest {

	@Test
	void fallsBackToOppositeLocaleWhenPrimaryResultsAreInsufficient() {
		var embeddingService = new FakeEmbeddingService();
		var repository = new StubRepository(
			List.of(result("neutral-summary", "summary", "neutral", 0.91d)),
			List.of(result("ko-project", "project-a", "ko", 0.84d))
		);
		var service = new RagQueryService(
			embeddingService,
			repository,
			new LocaleResolver(),
			new ContextAssembler(600, 180)
		);

		var response = service.query(new RagQueryRequest("technical challenges", "en", 2));

		assertEquals("technical challenges", embeddingService.lastQuery);
		assertEquals(List.of(
			List.of("en", "neutral"),
			List.of("ko")
		), repository.localeCalls);
		assertEquals(2, response.sources().size());
		assertEquals(2, response.retrieval().topK());
		assertEquals(2, response.retrieval().returned());
		assertTrue(response.context().contains("[Source 1]"));
		assertTrue(response.context().contains("neutral-summary"));
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

	private static final class FakeEmbeddingService implements EmbeddingService {

		private String lastQuery;

		@Override
		public List<Float> embedQuery(String query) {
			this.lastQuery = query;
			return List.of(0.1f, 0.2f, 0.3f);
		}

		@Override
		public List<List<Float>> embedDocuments(List<DocumentInput> documents) {
			throw new UnsupportedOperationException("Document embeddings are not used in query tests");
		}
	}

	private static final class StubRepository extends QdrantDocumentRepository {

		private final List<List<SearchResult>> responses;

		private final List<List<String>> localeCalls = new ArrayList<>();

		private StubRepository(List<SearchResult> primaryResults, List<SearchResult> fallbackResults) {
			super(
				new NoopGateway(),
				properties(),
				new QdrantPayloadMapper(),
				new QdrantFilterFactory()
			);
			this.responses = new ArrayList<>(List.of(primaryResults, fallbackResults));
		}

		@Override
		public List<SearchResult> search(List<Float> queryVector, List<String> locales, int topK) {
			this.localeCalls.add(List.copyOf(locales));
			return this.responses.remove(0);
		}

		private static QdrantProperties properties() {
			var properties = new QdrantProperties();
			properties.setCollection("test-collection");
			return properties;
		}
	}

	private static final class NoopGateway implements QdrantGateway {

		@Override
		public void upsert(String collectionName, List<Points.PointStruct> points) {
		}

		@Override
		public void delete(String collectionName, List<Common.PointId> pointIds) {
		}

		@Override
		public Points.ScrollResponse scroll(Points.ScrollPoints request) {
			return Points.ScrollResponse.getDefaultInstance();
		}

		@Override
		public List<Points.ScoredPoint> query(Points.QueryPoints request) {
			return List.of();
		}

		@Override
		public long count(String collectionName) {
			return 0;
		}
	}
}
