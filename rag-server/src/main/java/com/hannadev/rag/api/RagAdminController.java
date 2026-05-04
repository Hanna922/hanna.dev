package com.hannadev.rag.api;

import com.hannadev.rag.api.dto.FullSyncRequest;
import com.hannadev.rag.api.dto.FullSyncResponse;
import com.hannadev.rag.service.RagIndexSyncService;
import jakarta.validation.Valid;
import java.util.Map;
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

	private final RagIndexSyncService ragIndexSyncService;

	public RagAdminController(RagIndexSyncService ragIndexSyncService) {
		this.ragIndexSyncService = ragIndexSyncService;
	}

	@PostMapping("/full-sync")
	public ResponseEntity<FullSyncResponse> fullSync(
		@Valid @RequestBody FullSyncRequest request
	) {
		return ResponseEntity.ok(this.ragIndexSyncService.fullSync(request));
	}

	@DeleteMapping("/{docId}")
	public ResponseEntity<Map<String, Object>> delete(@PathVariable String docId) {
		var result = this.ragIndexSyncService.deleteDocument(docId);
		return ResponseEntity.ok(Map.of("docId", result.docId(), "deleted", result.deleted()));
	}

	@GetMapping("/stats")
	public ResponseEntity<Map<String, Object>> stats() {
		var stats = this.ragIndexSyncService.stats();
		return ResponseEntity.ok(Map.of(
			"collection",
			stats.collection(),
			"totalPoints",
			stats.totalPoints()
		));
	}
}
