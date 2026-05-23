package com.hannadev.rag.qdrant;

import io.qdrant.client.PointIdFactory;
import io.qdrant.client.ValueFactory;
import io.qdrant.client.VectorsFactory;
import io.qdrant.client.grpc.Common;
import io.qdrant.client.grpc.JsonWithInt;
import io.qdrant.client.grpc.Points;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class QdrantPayloadMapper {

	public Points.PointStruct toPoint(QdrantDocumentRepository.IndexedDocument document) {
		return Points.PointStruct.newBuilder()
			.setId(pointId(document.docId()))
			.setVectors(VectorsFactory.vectors(document.vector()))
			.putAllPayload(payload(document))
			.build();
	}

	public Common.PointId pointId(String docId) {
		return PointIdFactory.id(
			UUID.nameUUIDFromBytes(docId.getBytes(StandardCharsets.UTF_8))
		);
	}

	public QdrantDocumentRepository.SearchResult toSearchResult(Points.ScoredPoint point) {
		var payload = point.getPayloadMap();
		return new QdrantDocumentRepository.SearchResult(
			stringValue(payload, "docId"),
			stringValue(payload, "baseSlug"),
			stringValue(payload, "locale"),
			stringValue(payload, "title"),
			stringValue(payload, "titleEn"),
			stringValue(payload, "description"),
			stringValue(payload, "url"),
			listValue(payload, "tags"),
			stringValue(payload, "sourceType"),
			stringValue(payload, "publishedAt"),
			stringValue(payload, "contentHash"),
			stringValue(payload, "fullText"),
			point.getScore()
		);
	}

	public String stringValue(Map<String, JsonWithInt.Value> payload, String fieldName) {
		var value = payload.get(fieldName);
		return value == null ? null : value.getStringValue();
	}

	public List<String> listValue(Map<String, JsonWithInt.Value> payload, String fieldName) {
		var value = payload.get(fieldName);
		if (value == null) {
			return List.of();
		}

		return value.getListValue()
			.getValuesList()
			.stream()
			.map(JsonWithInt.Value::getStringValue)
			.toList();
	}

	private Map<String, JsonWithInt.Value> payload(
		QdrantDocumentRepository.IndexedDocument document
	) {
		var payload = new LinkedHashMap<String, JsonWithInt.Value>();
		putString(payload, "docId", document.docId());
		putString(payload, "baseSlug", document.baseSlug());
		putString(payload, "locale", document.locale());
		putString(payload, "title", document.title());
		putString(payload, "titleEn", document.titleEn());
		putString(payload, "description", document.description());
		putString(payload, "url", document.url());
		payload.put(
			"tags",
			ValueFactory.list(document.tags().stream().map(ValueFactory::value).toList())
		);
		putString(payload, "sourceType", document.sourceType());
		putString(payload, "publishedAt", document.publishedAt());
		putString(payload, "contentHash", document.contentHash());
		putString(payload, "fullText", document.fullText());
		return payload;
	}

	private void putString(
		Map<String, JsonWithInt.Value> payload,
		String key,
		String value
	) {
		if (value != null) {
			payload.put(key, ValueFactory.value(value));
		}
	}
}
