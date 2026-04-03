package com.hannadev.rag.service;

import com.hannadev.rag.api.dto.RagQueryRequest;
import com.hannadev.rag.api.dto.RagQueryResponse;
import com.hannadev.rag.embedding.EmbeddingService;
import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

@Service
public class RagQueryService implements RagQueryUseCase {

	private final EmbeddingService embeddingService;

	private final QdrantDocumentRepository repository;

	private final LocaleResolver localeResolver;

	private final ContextAssembler contextAssembler;

	public RagQueryService(
		EmbeddingService embeddingService,
		QdrantDocumentRepository repository,
		LocaleResolver localeResolver,
		ContextAssembler contextAssembler
	) {
		this.embeddingService = embeddingService;
		this.repository = repository;
		this.localeResolver = localeResolver;
		this.contextAssembler = contextAssembler;
	}

	@Override
	public RagQueryResponse query(RagQueryRequest request) {
		var startedAt = System.nanoTime();
		var queryVector = this.embeddingService.embedQuery(request.query());
		var selectedResults = this.localeResolver.deduplicate(
			this.repository.search(
				queryVector,
				this.localeResolver.primaryLocales(request.locale()),
				request.topK()
			),
			request.locale(),
			request.topK()
		);

		var fallbackLocales = this.localeResolver.fallbackLocales(request.locale());
		if (selectedResults.size() < request.topK() && !CollectionUtils.isEmpty(fallbackLocales)) {
			selectedResults = this.localeResolver.merge(
				selectedResults,
				this.repository.search(queryVector, fallbackLocales, request.topK()),
				request.locale(),
				request.topK()
			);
		}

		var context = this.contextAssembler.assemble(selectedResults, request.locale());
		var sources = selectedResults.stream()
			.map(result -> toSourceRef(result, request.locale()))
			.toList();

		return new RagQueryResponse(
			context,
			sources,
			new RagQueryResponse.RetrievalMetadata(
				request.topK(),
				sources.size(),
				Duration.ofNanos(System.nanoTime() - startedAt).toMillis()
			)
		);
	}

	private RagQueryResponse.SourceRef toSourceRef(
		QdrantDocumentRepository.SearchResult result,
		String requestedLocale
	) {
		return new RagQueryResponse.SourceRef(
			result.docId(),
			title(result, requestedLocale),
			result.url(),
			result.score(),
			result.locale(),
			result.sourceType()
		);
	}

	private String title(QdrantDocumentRepository.SearchResult result, String requestedLocale) {
		if ("en".equalsIgnoreCase(requestedLocale) && StringUtils.hasText(result.titleEn())) {
			return result.titleEn();
		}
		if (StringUtils.hasText(result.title())) {
			return result.title();
		}
		return result.titleEn();
	}
}
