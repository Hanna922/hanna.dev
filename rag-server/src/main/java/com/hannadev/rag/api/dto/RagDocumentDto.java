package com.hannadev.rag.api.dto;

import java.util.List;

public record RagDocumentDto(
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
	String fullText
) {
}
