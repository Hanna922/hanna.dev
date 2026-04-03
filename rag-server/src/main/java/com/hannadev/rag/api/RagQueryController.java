package com.hannadev.rag.api;

import com.hannadev.rag.api.dto.RagQueryRequest;
import com.hannadev.rag.api.dto.RagQueryResponse;
import com.hannadev.rag.service.RagQueryUseCase;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/rag")
public class RagQueryController {

	private final RagQueryUseCase ragQueryUseCase;

	public RagQueryController(RagQueryUseCase ragQueryUseCase) {
		this.ragQueryUseCase = ragQueryUseCase;
	}

	@PostMapping("/query")
	public ResponseEntity<RagQueryResponse> query(@Valid @RequestBody RagQueryRequest request) {
		return ResponseEntity.ok(this.ragQueryUseCase.query(request));
	}
}
