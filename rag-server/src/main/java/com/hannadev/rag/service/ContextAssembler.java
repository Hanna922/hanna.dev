package com.hannadev.rag.service;

import com.hannadev.rag.config.RagProperties;
import com.hannadev.rag.qdrant.QdrantDocumentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class ContextAssembler {

	private static final int DEFAULT_MAX_CHARS_PER_SOURCE = 2500;

	private final int contextMaxChars;

	private final int maxCharsPerSource;

	@Autowired
	public ContextAssembler(RagProperties ragProperties) {
		this(ragProperties.getContextMaxChars(), DEFAULT_MAX_CHARS_PER_SOURCE);
	}

	ContextAssembler(int contextMaxChars, int maxCharsPerSource) {
		this.contextMaxChars = contextMaxChars;
		this.maxCharsPerSource = maxCharsPerSource;
	}

	public String assemble(
		java.util.List<QdrantDocumentRepository.SearchResult> results,
		String requestedLocale
	) {
		var builder = new StringBuilder();
		for (var index = 0; index < results.size(); index++) {
			var separator = builder.length() == 0 ? "" : "\n\n";
			var result = results.get(index);
			var header = "[Source " + (index + 1) + "]\n"
				+ "Title: " + title(result, requestedLocale) + "\n"
				+ "URL: " + value(result.url()) + "\n"
				+ "Content:\n";
			var available = this.contextMaxChars - builder.length() - separator.length() - header.length();
			if (available <= 0) {
				break;
			}

			var excerpt = truncate(
				normalizeWhitespace(result.fullText()),
				Math.min(this.maxCharsPerSource, available)
			);
			builder.append(separator).append(header).append(excerpt);
		}
		return builder.toString();
	}

	private String title(QdrantDocumentRepository.SearchResult result, String requestedLocale) {
		if ("en".equalsIgnoreCase(requestedLocale) && StringUtils.hasText(result.titleEn())) {
			return result.titleEn();
		}
		if (StringUtils.hasText(result.title())) {
			return result.title();
		}
		return value(result.titleEn());
	}

	private String normalizeWhitespace(String text) {
		return value(text).replaceAll("\\s+", " ").trim();
	}

	private String truncate(String text, int maxChars) {
		if (text.length() <= maxChars) {
			return text;
		}
		if (maxChars <= 3) {
			return text.substring(0, maxChars);
		}
		return text.substring(0, maxChars - 3).trim() + "...";
	}

	private String value(String text) {
		return text == null ? "" : text;
	}
}
