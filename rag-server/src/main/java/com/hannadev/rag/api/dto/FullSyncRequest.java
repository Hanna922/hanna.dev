package com.hannadev.rag.api.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record FullSyncRequest(
	@NotBlank String syncId,
	boolean replaceMissing,
	List<RagDocumentDto> documents
) {
}
