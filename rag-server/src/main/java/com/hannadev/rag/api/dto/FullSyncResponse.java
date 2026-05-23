package com.hannadev.rag.api.dto;

public record FullSyncResponse(
	int total,
	int inserted,
	int updated,
	int deleted,
	int skipped
) {
}
