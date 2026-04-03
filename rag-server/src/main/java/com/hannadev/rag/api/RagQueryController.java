package com.hannadev.rag.api;

import com.hannadev.rag.api.dto.RagQueryRequest;
import com.hannadev.rag.api.dto.RagQueryResponse;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/rag")
public class RagQueryController {

	@PostMapping("/query")
	public ResponseEntity<RagQueryResponse> query(@Valid @RequestBody RagQueryRequest request) {
		var response = new RagQueryResponse(
			"",
			List.of(),
			new RagQueryResponse.RetrievalMetadata(request.topK(), 0, 0)
		);

		return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(response);
	}
}
