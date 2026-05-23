package com.hannadev.rag.service;

import com.hannadev.rag.api.dto.RagQueryRequest;
import com.hannadev.rag.api.dto.RagQueryResponse;

public interface RagQueryUseCase {

	RagQueryResponse query(RagQueryRequest request);
}
