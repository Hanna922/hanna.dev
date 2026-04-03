package com.hannadev.rag.api;

import com.hannadev.rag.api.dto.FullSyncRequest;
import com.hannadev.rag.api.dto.FullSyncResponse;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/admin/index")
public class RagAdminController {

	@PostMapping("/full-sync")
	public ResponseEntity<FullSyncResponse> fullSync(
		@Valid @RequestBody FullSyncRequest request
	) {
		var total = request.documents() == null ? 0 : request.documents().size();
		var response = new FullSyncResponse(total, 0, 0, 0, total);
		return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(response);
	}

	@DeleteMapping("/{docId}")
	public ResponseEntity<Map<String, Object>> delete(@PathVariable String docId) {
		return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
			.body(Map.of("docId", docId, "deleted", false));
	}

	@GetMapping("/stats")
	public ResponseEntity<Map<String, Object>> stats() {
		return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
			.body(Map.of("collection", "hanna-dev-documents"));
	}
}
