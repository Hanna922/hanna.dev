package com.hannadev.rag.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record RagQueryRequest(
	@NotBlank String query,
	@NotBlank String locale,
	@NotNull Integer topK
) {
}
