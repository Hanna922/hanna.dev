package com.hannadev.rag.service;

import com.hannadev.rag.api.dto.FullSyncRequest;
import com.hannadev.rag.api.dto.FullSyncResponse;
import com.hannadev.rag.api.dto.RagDocumentDto;
import com.hannadev.rag.config.QdrantProperties;
import com.hannadev.rag.embedding.EmbeddingService;
import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class RagIndexSyncService {

	private final QdrantDocumentRepository repository;

	private final EmbeddingService embeddingService;

	private final ContentHashService contentHashService;

	private final QdrantProperties qdrantProperties;

	public RagIndexSyncService(
		QdrantDocumentRepository repository,
		EmbeddingService embeddingService,
		ContentHashService contentHashService,
		QdrantProperties qdrantProperties
	) {
		this.repository = repository;
		this.embeddingService = embeddingService;
		this.contentHashService = contentHashService;
		this.qdrantProperties = qdrantProperties;
	}

	public FullSyncResponse fullSync(FullSyncRequest request) {
		var documents = request.documents() == null ? List.<RagDocumentDto>of() : request.documents();
		if (documents.isEmpty() && !request.replaceMissing()) {
			return new FullSyncResponse(0, 0, 0, 0, 0);
		}

		var existingHashes = this.repository.findAllDocIdsAndHashes();
		var changedDocuments = new ArrayList<RagDocumentDto>();
		var changedHashes = new ArrayList<String>();
		var inserted = 0;
		var updated = 0;
		var skipped = 0;

		for (var document : documents) {
			var contentHash = this.contentHashService.hash(document);
			var existingHash = existingHashes.get(document.docId());

			if (contentHash.equals(existingHash)) {
				skipped++;
				continue;
			}

			changedDocuments.add(document);
			changedHashes.add(contentHash);
			if (existingHash == null) {
				inserted++;
			}
			else {
				updated++;
			}
		}

		if (!changedDocuments.isEmpty()) {
			var embeddings = this.embeddingService.embedDocuments(changedDocuments.stream()
				.map(this::toDocumentInput)
				.toList());
			this.repository.upsertDocuments(indexedDocuments(
				changedDocuments,
				changedHashes,
				embeddings
			));
		}

		var deleted = 0;
		if (request.replaceMissing()) {
			var incomingDocIds = documents.stream()
				.map(RagDocumentDto::docId)
				.collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
			var missingDocIds = existingHashes.keySet().stream()
				.filter(docId -> !incomingDocIds.contains(docId))
				.toList();
			if (!missingDocIds.isEmpty()) {
				this.repository.deleteByDocIds(missingDocIds);
				deleted = missingDocIds.size();
			}
		}

		return new FullSyncResponse(
			documents.size(),
			inserted,
			updated,
			deleted,
			skipped
		);
	}

	public DeleteResult deleteDocument(String docId) {
		this.repository.deleteByDocIds(List.of(docId));
		return new DeleteResult(docId, true);
	}

	public StatsResult stats() {
		return new StatsResult(
			this.qdrantProperties.getCollection(),
			this.repository.getStats().totalPoints()
		);
	}

	private List<QdrantDocumentRepository.IndexedDocument> indexedDocuments(
		List<RagDocumentDto> documents,
		List<String> contentHashes,
		List<List<Float>> embeddings
	) {
		var indexedDocuments = new ArrayList<QdrantDocumentRepository.IndexedDocument>();
		for (var index = 0; index < documents.size(); index++) {
			var document = documents.get(index);
			indexedDocuments.add(new QdrantDocumentRepository.IndexedDocument(
				document.docId(),
				document.baseSlug(),
				document.locale(),
				document.title(),
				document.titleEn(),
				document.description(),
				document.url(),
				document.tags() == null ? List.of() : document.tags(),
				document.sourceType(),
				document.publishedAt(),
				contentHashes.get(index),
				document.fullText(),
				embeddings.get(index)
			));
		}
		return indexedDocuments;
	}

	private EmbeddingService.DocumentInput toDocumentInput(RagDocumentDto document) {
		return new EmbeddingService.DocumentInput(preferredTitle(document), document.fullText());
	}

	private String preferredTitle(RagDocumentDto document) {
		if (StringUtils.hasText(document.title())) {
			return document.title();
		}
		return document.titleEn();
	}

	public record DeleteResult(
		String docId,
		boolean deleted
	) {
	}

	public record StatsResult(
		String collection,
		long totalPoints
	) {
	}
}
