package com.hannadev.rag.service;

import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import java.util.LinkedHashMap;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component("ragLocaleResolver")
public class LocaleResolver {

	public List<String> primaryLocales(String requestedLocale) {
		if ("en".equalsIgnoreCase(requestedLocale)) {
			return List.of("en", "neutral");
		}
		if ("ko".equalsIgnoreCase(requestedLocale)) {
			return List.of("ko", "neutral");
		}
		if (StringUtils.hasText(requestedLocale)) {
			return List.of(requestedLocale, "neutral");
		}
		return List.of("neutral");
	}

	public List<String> fallbackLocales(String requestedLocale) {
		if ("en".equalsIgnoreCase(requestedLocale)) {
			return List.of("ko");
		}
		if ("ko".equalsIgnoreCase(requestedLocale)) {
			return List.of("en");
		}
		return List.of();
	}

	public List<QdrantDocumentRepository.SearchResult> deduplicate(
		List<QdrantDocumentRepository.SearchResult> results,
		String requestedLocale,
		int topK
	) {
		return merge(results, List.of(), requestedLocale, topK);
	}

	public List<QdrantDocumentRepository.SearchResult> merge(
		List<QdrantDocumentRepository.SearchResult> primaryResults,
		List<QdrantDocumentRepository.SearchResult> fallbackResults,
		String requestedLocale,
		int topK
	) {
		var selected = new LinkedHashMap<String, QdrantDocumentRepository.SearchResult>();
		for (var candidate : primaryResults) {
			selectResult(selected, candidate, requestedLocale);
		}
		for (var candidate : fallbackResults) {
			selectResult(selected, candidate, requestedLocale);
		}
		return selected.values().stream().limit(topK).toList();
	}

	private void selectResult(
		LinkedHashMap<String, QdrantDocumentRepository.SearchResult> selected,
		QdrantDocumentRepository.SearchResult candidate,
		String requestedLocale
	) {
		var key = StringUtils.hasText(candidate.baseSlug())
			? candidate.baseSlug()
			: candidate.docId();
		var existing = selected.get(key);
		if (existing == null || localeRank(candidate.locale(), requestedLocale) < localeRank(existing.locale(), requestedLocale)) {
			selected.put(key, candidate);
		}
	}

	private int localeRank(String locale, String requestedLocale) {
		if (requestedLocale != null && requestedLocale.equalsIgnoreCase(locale)) {
			return 0;
		}
		if ("neutral".equalsIgnoreCase(locale)) {
			return 1;
		}
		return 2;
	}
}
