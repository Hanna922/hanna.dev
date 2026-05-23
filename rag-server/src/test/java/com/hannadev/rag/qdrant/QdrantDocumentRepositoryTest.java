package com.hannadev.rag.qdrant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.hannadev.rag.config.QdrantProperties;
import io.qdrant.client.PointIdFactory;
import io.qdrant.client.ValueFactory;
import io.qdrant.client.grpc.Common;
import io.qdrant.client.grpc.JsonWithInt;
import io.qdrant.client.grpc.Points;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class QdrantDocumentRepositoryTest {

	@Test
	void upsertDocumentsMapsDeterministicPointIdsAndPayload() {
		var gateway = new FakeQdrantGateway();
		var repository = repository(gateway);

		repository.upsertDocuments(List.of(sampleDocument("doc-1", "ko")));

		assertEquals("hanna-dev-documents", gateway.upsertCollection);
		assertEquals(1, gateway.upsertedPoints.size());
		var point = gateway.upsertedPoints.get(0);
		assertEquals(deterministicId("doc-1"), point.getId().getUuid());
		assertEquals("doc-1", point.getPayloadOrThrow("docId").getStringValue());
		assertEquals("base-doc-1", point.getPayloadOrThrow("baseSlug").getStringValue());
		assertEquals("hash-doc-1", point.getPayloadOrThrow("contentHash").getStringValue());
		assertIterableEquals(
			List.of("rag", "portfolio"),
			stringValues(point.getPayloadOrThrow("tags"))
		);
	}

	@Test
	void deleteByDocIdsUsesDeterministicPointIds() {
		var gateway = new FakeQdrantGateway();
		var repository = repository(gateway);

		repository.deleteByDocIds(List.of("doc-1", "doc-2"));

		assertEquals("hanna-dev-documents", gateway.deleteCollection);
		assertIterableEquals(
			List.of(deterministicId("doc-1"), deterministicId("doc-2")),
			gateway.deletedPointIds.stream().map(Common.PointId::getUuid).toList()
		);
	}

	@Test
	void findAllDocIdsAndHashesScrollsAcrossPages() {
		var gateway = new FakeQdrantGateway();
		gateway.scrollResponses.add(Points.ScrollResponse.newBuilder()
			.addResult(retrievedPoint("doc-1", "hash-1"))
			.setNextPageOffset(PointIdFactory.id(UUID.randomUUID()))
			.build());
		gateway.scrollResponses.add(Points.ScrollResponse.newBuilder()
			.addResult(retrievedPoint("doc-2", "hash-2"))
			.build());

		var repository = repository(gateway);

		var hashes = repository.findAllDocIdsAndHashes();

		assertEquals(Map.of("doc-1", "hash-1", "doc-2", "hash-2"), hashes);
		assertEquals(2, gateway.scrollRequests.size());
		assertFalse(gateway.scrollRequests.get(0).hasOffset());
		assertTrue(gateway.scrollRequests.get(1).hasOffset());
	}

	@Test
	void searchFiltersByLocaleAndMapsResults() {
		var gateway = new FakeQdrantGateway();
		gateway.queryResults = List.of(scoredPoint("doc-1", "ko", 0.82f));

		var repository = repository(gateway);

		var results = repository.search(List.of(0.5f, 0.25f), List.of("ko", "neutral"), 3);

		assertEquals(1, results.size());
		assertEquals("doc-1", results.get(0).docId());
		assertEquals("ko", results.get(0).locale());
		assertEquals("Document title", results.get(0).title());
		assertEquals(0.82d, results.get(0).score(), 0.0001d);
		assertEquals(3L, gateway.queryRequest.getLimit());
		assertEquals("hanna-dev-documents", gateway.queryRequest.getCollectionName());
		assertEquals(
			List.of("ko", "neutral"),
			gateway.queryRequest.getFilter()
				.getMust(0)
				.getField()
				.getMatch()
				.getKeywords()
				.getStringsList()
		);
	}

	@Test
	void getStatsReturnsPointCount() {
		var gateway = new FakeQdrantGateway();
		gateway.count = 42L;

		var repository = repository(gateway);

		var stats = repository.getStats();

		assertEquals(42L, stats.totalPoints());
	}

	private QdrantDocumentRepository repository(FakeQdrantGateway gateway) {
		var properties = new QdrantProperties();
		properties.setCollection("hanna-dev-documents");
		return new QdrantDocumentRepository(
			gateway,
			properties,
			new QdrantPayloadMapper(),
			new QdrantFilterFactory()
		);
	}

	private QdrantDocumentRepository.IndexedDocument sampleDocument(String docId, String locale) {
		return new QdrantDocumentRepository.IndexedDocument(
			docId,
			"base-" + docId,
			locale,
			"Document title",
			"Document title en",
			"Description",
			"https://hanna.dev/" + docId,
			List.of("rag", "portfolio"),
			"blog",
			"2026-04-03T00:00:00Z",
			"hash-" + docId,
			"Document body for " + docId,
			List.of(0.1f, 0.2f, 0.3f)
		);
	}

	private Points.RetrievedPoint retrievedPoint(String docId, String contentHash) {
		return Points.RetrievedPoint.newBuilder()
			.setId(PointIdFactory.id(UUID.randomUUID()))
			.putPayload("docId", ValueFactory.value(docId))
			.putPayload("contentHash", ValueFactory.value(contentHash))
			.build();
	}

	private Points.ScoredPoint scoredPoint(String docId, String locale, float score) {
		return Points.ScoredPoint.newBuilder()
			.setId(PointIdFactory.id(UUID.randomUUID()))
			.setScore(score)
			.putPayload("docId", ValueFactory.value(docId))
			.putPayload("baseSlug", ValueFactory.value("base-doc-1"))
			.putPayload("locale", ValueFactory.value(locale))
			.putPayload("title", ValueFactory.value("Document title"))
			.putPayload("titleEn", ValueFactory.value("Document title en"))
			.putPayload("description", ValueFactory.value("Description"))
			.putPayload("url", ValueFactory.value("https://hanna.dev/doc-1"))
			.putPayload("tags", ValueFactory.list(List.of(
				ValueFactory.value("rag"),
				ValueFactory.value("portfolio")
			)))
			.putPayload("sourceType", ValueFactory.value("blog"))
			.putPayload("publishedAt", ValueFactory.value("2026-04-03T00:00:00Z"))
			.putPayload("contentHash", ValueFactory.value("hash-doc-1"))
			.putPayload("fullText", ValueFactory.value("Document body"))
			.build();
	}

	private List<String> stringValues(JsonWithInt.Value value) {
		return value.getListValue()
			.getValuesList()
			.stream()
			.map(JsonWithInt.Value::getStringValue)
			.toList();
	}

	private String deterministicId(String docId) {
		return UUID.nameUUIDFromBytes(docId.getBytes(StandardCharsets.UTF_8)).toString();
	}

	private static final class FakeQdrantGateway implements QdrantGateway {

		private String upsertCollection;
		private List<Points.PointStruct> upsertedPoints = List.of();
		private String deleteCollection;
		private List<Common.PointId> deletedPointIds = List.of();
		private final List<Points.ScrollPoints> scrollRequests = new ArrayList<>();
		private final List<Points.ScrollResponse> scrollResponses = new ArrayList<>();
		private Points.QueryPoints queryRequest;
		private List<Points.ScoredPoint> queryResults = List.of();
		private long count;

		@Override
		public void upsert(String collectionName, List<Points.PointStruct> points) {
			this.upsertCollection = collectionName;
			this.upsertedPoints = points;
		}

		@Override
		public void delete(String collectionName, List<Common.PointId> pointIds) {
			this.deleteCollection = collectionName;
			this.deletedPointIds = pointIds;
		}

		@Override
		public Points.ScrollResponse scroll(Points.ScrollPoints request) {
			this.scrollRequests.add(request);
			return this.scrollResponses.remove(0);
		}

		@Override
		public List<Points.ScoredPoint> query(Points.QueryPoints request) {
			this.queryRequest = request;
			return this.queryResults;
		}

		@Override
		public long count(String collectionName) {
			return this.count;
		}
	}
}
