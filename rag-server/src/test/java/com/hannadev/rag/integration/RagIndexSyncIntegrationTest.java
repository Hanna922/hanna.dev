package com.hannadev.rag.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.google.common.util.concurrent.ListenableFuture;
import com.hannadev.rag.api.dto.FullSyncRequest;
import com.hannadev.rag.api.dto.FullSyncResponse;
import com.hannadev.rag.api.dto.RagDocumentDto;
import com.hannadev.rag.config.QdrantProperties;
import com.hannadev.rag.embedding.EmbeddingService;
import com.hannadev.rag.qdrant.QdrantClientGateway;
import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import com.hannadev.rag.qdrant.QdrantFilterFactory;
import com.hannadev.rag.qdrant.QdrantPayloadMapper;
import com.hannadev.rag.service.ContentHashService;
import com.hannadev.rag.service.RagIndexSyncService;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Collections.Distance;
import io.qdrant.client.grpc.Collections.VectorParams;
import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class RagIndexSyncIntegrationTest {

	@Container
	static final GenericContainer<?> qdrant = new GenericContainer<>("qdrant/qdrant:v1.16.3")
		.withExposedPorts(6334);

	private QdrantClient qdrantClient;

	private QdrantDocumentRepository repository;

	private FakeEmbeddingService embeddingService;

	private RagIndexSyncService ragIndexSyncService;

	@BeforeEach
	void setUp() throws ExecutionException, InterruptedException {
		this.qdrantClient = new QdrantClient(QdrantGrpcClient.newBuilder(
			qdrant.getHost(),
			qdrant.getMappedPort(6334),
			false
		).build());

		var properties = new QdrantProperties();
		properties.setCollection("rag-sync-" + UUID.randomUUID());

		await(this.qdrantClient.createCollectionAsync(
			properties.getCollection(),
			VectorParams.newBuilder()
				.setDistance(Distance.Cosine)
				.setSize(3)
				.build()
		));

		this.repository = new QdrantDocumentRepository(
			new QdrantClientGateway(this.qdrantClient),
			properties,
			new QdrantPayloadMapper(),
			new QdrantFilterFactory()
		);
		this.embeddingService = new FakeEmbeddingService();
		this.ragIndexSyncService = new RagIndexSyncService(
			this.repository,
			this.embeddingService,
			new ContentHashService(),
			properties
		);
	}

	@AfterEach
	@PreDestroy
	void tearDown() {
		if (this.qdrantClient != null) {
			this.qdrantClient.close();
		}
	}

	@Test
	void fullSyncInsertsSkipsUpdatesAndDeletesAgainstQdrant() {
		var firstRequest = new FullSyncRequest("sync-1", true, List.of(
			document("doc-1", "Body one"),
			document("doc-2", "Body two")
		));
		var secondRequest = new FullSyncRequest("sync-2", true, List.of(
			document("doc-1", "Body one"),
			document("doc-2", "Body two")
		));
		var thirdRequest = new FullSyncRequest("sync-3", true, List.of(
			document("doc-1", "Body one updated"),
			document("doc-2", "Body two")
		));
		var fourthRequest = new FullSyncRequest("sync-4", true, List.of(
			document("doc-1", "Body one updated")
		));

		var firstResponse = this.ragIndexSyncService.fullSync(firstRequest);
		var hashesAfterFirst = this.repository.findAllDocIdsAndHashes();
		var countAfterFirst = this.repository.getStats().totalPoints();
		var secondResponse = this.ragIndexSyncService.fullSync(secondRequest);
		var thirdResponse = this.ragIndexSyncService.fullSync(thirdRequest);
		var hashesAfterThird = this.repository.findAllDocIdsAndHashes();
		var fourthResponse = this.ragIndexSyncService.fullSync(fourthRequest);
		var finalCount = this.repository.getStats().totalPoints();

		assertEquals(new FullSyncResponse(2, 2, 0, 0, 0), firstResponse);
		assertEquals(2L, countAfterFirst);
		assertEquals(new FullSyncResponse(2, 0, 0, 0, 2), secondResponse);
		assertEquals(new FullSyncResponse(2, 0, 1, 0, 1), thirdResponse);
		assertNotEquals(
			hashesAfterFirst.get("doc-1"),
			hashesAfterThird.get("doc-1")
		);
		assertEquals(
			hashesAfterFirst.get("doc-2"),
			hashesAfterThird.get("doc-2")
		);
		assertEquals(new FullSyncResponse(1, 0, 0, 1, 1), fourthResponse);
		assertEquals(Map.of("doc-1", hashesAfterThird.get("doc-1")), this.repository.findAllDocIdsAndHashes());
		assertEquals(1L, finalCount);
		assertEquals(List.of(2, 1), this.embeddingService.batchSizes);
	}

	private RagDocumentDto document(String docId, String fullText) {
		return new RagDocumentDto(
			docId,
			"base-" + docId,
			"ko",
			"Title " + docId,
			"Title EN " + docId,
			"Description " + docId,
			"https://hanna.dev/" + docId,
			List.of("rag", "portfolio"),
			"blog",
			"2026-04-03T00:00:00Z",
			fullText
		);
	}

	private <T> T await(ListenableFuture<T> future)
		throws ExecutionException, InterruptedException {
		return future.get();
	}

	private static final class FakeEmbeddingService implements EmbeddingService {

		private final List<Integer> batchSizes = new ArrayList<>();

		@Override
		public List<Float> embedQuery(String query) {
			throw new UnsupportedOperationException("Query embeddings are not used in sync tests");
		}

		@Override
		public List<List<Float>> embedDocuments(List<DocumentInput> documents) {
			this.batchSizes.add(documents.size());
			return documents.stream()
				.map(document -> vectorFor(document.text()))
				.toList();
		}

		private List<Float> vectorFor(String text) {
			var hash = Math.abs(text.hashCode());
			return List.of(
				(float) ((hash % 997) + 1),
				(float) (((hash / 997) % 997) + 1),
				(float) (((hash / (997 * 997)) % 997) + 1)
			);
		}
	}
}
