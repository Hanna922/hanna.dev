package com.hannadev.rag.qdrant;

import com.hannadev.rag.config.QdrantProperties;
import io.qdrant.client.QueryFactory;
import io.qdrant.client.WithPayloadSelectorFactory;
import io.qdrant.client.WithVectorsSelectorFactory;
import io.qdrant.client.grpc.Common;
import io.qdrant.client.grpc.Points;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

@Repository
public class QdrantDocumentRepository {

	private static final int SCROLL_LIMIT = 256;

	private final QdrantGateway qdrantGateway;

	private final QdrantProperties qdrantProperties;

	private final QdrantPayloadMapper payloadMapper;

	private final QdrantFilterFactory filterFactory;

	public QdrantDocumentRepository(
		QdrantGateway qdrantGateway,
		QdrantProperties qdrantProperties,
		QdrantPayloadMapper payloadMapper,
		QdrantFilterFactory filterFactory
	) {
		this.qdrantGateway = qdrantGateway;
		this.qdrantProperties = qdrantProperties;
		this.payloadMapper = payloadMapper;
		this.filterFactory = filterFactory;
	}

	public void upsertDocuments(List<IndexedDocument> documents) {
		if (documents.isEmpty()) {
			return;
		}

		this.qdrantGateway.upsert(
			this.qdrantProperties.getCollection(),
			documents.stream().map(this.payloadMapper::toPoint).toList()
		);
	}

	public void deleteByDocIds(List<String> docIds) {
		if (docIds.isEmpty()) {
			return;
		}

		this.qdrantGateway.delete(
			this.qdrantProperties.getCollection(),
			docIds.stream().map(this.payloadMapper::pointId).toList()
		);
	}

	public Map<String, String> findAllDocIdsAndHashes() {
		var hashes = new LinkedHashMap<String, String>();
		Common.PointId offset = null;

		while (true) {
			var builder = Points.ScrollPoints.newBuilder()
				.setCollectionName(this.qdrantProperties.getCollection())
				.setLimit(SCROLL_LIMIT)
				.setWithPayload(WithPayloadSelectorFactory.include(List.of("docId", "contentHash")))
				.setWithVectors(WithVectorsSelectorFactory.enable(false));

			if (offset != null) {
				builder.setOffset(offset);
			}

			var response = this.qdrantGateway.scroll(builder.build());
			for (var point : response.getResultList()) {
				var docId = this.payloadMapper.stringValue(point.getPayloadMap(), "docId");
				if (docId != null) {
					hashes.put(
						docId,
						this.payloadMapper.stringValue(point.getPayloadMap(), "contentHash")
					);
				}
			}

			if (!response.hasNextPageOffset()) {
				return hashes;
			}
			offset = response.getNextPageOffset();
		}
	}

	public List<SearchResult> search(List<Float> queryVector, List<String> locales, int topK) {
		var builder = Points.QueryPoints.newBuilder()
			.setCollectionName(this.qdrantProperties.getCollection())
			.setQuery(QueryFactory.nearest(queryVector))
			.setLimit(topK)
			.setWithPayload(WithPayloadSelectorFactory.enable(true))
			.setWithVectors(WithVectorsSelectorFactory.enable(false));

		var filter = this.filterFactory.forLocales(locales);
		if (filter != null) {
			builder.setFilter(filter);
		}

		return this.qdrantGateway.query(builder.build())
			.stream()
			.map(this.payloadMapper::toSearchResult)
			.toList();
	}

	public CollectionStats getStats() {
		return new CollectionStats(this.qdrantGateway.count(this.qdrantProperties.getCollection()));
	}

	public record IndexedDocument(
		String docId,
		String baseSlug,
		String locale,
		String title,
		String titleEn,
		String description,
		String url,
		List<String> tags,
		String sourceType,
		String publishedAt,
		String contentHash,
		String fullText,
		List<Float> vector
	) {
	}

	public record SearchResult(
		String docId,
		String baseSlug,
		String locale,
		String title,
		String titleEn,
		String description,
		String url,
		List<String> tags,
		String sourceType,
		String publishedAt,
		String contentHash,
		String fullText,
		double score
	) {
	}

	public record CollectionStats(
		long totalPoints
	) {
	}
}
