package com.hannadev.rag.embedding;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hannadev.rag.config.RagProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class GeminiEmbeddingClient implements EmbeddingService {

	private final HttpClient httpClient;

	private final ObjectMapper objectMapper;

	private final RagProperties ragProperties;

	@Autowired
	public GeminiEmbeddingClient(ObjectMapper objectMapper, RagProperties ragProperties) {
		this(HttpClient.newHttpClient(), objectMapper, ragProperties);
	}

	GeminiEmbeddingClient(
		HttpClient httpClient,
		ObjectMapper objectMapper,
		RagProperties ragProperties
	) {
		this.httpClient = httpClient;
		this.objectMapper = objectMapper;
		this.ragProperties = ragProperties;
	}

	@Override
	public List<Float> embedQuery(String query) {
		var request = new EmbedContentRequest(
			modelName(),
			new Content(List.of(new Part(query))),
			"RETRIEVAL_QUERY",
			null
		);
		var response = post(
			"/v1beta/models/" + this.ragProperties.getEmbedding().getModel() + ":embedContent",
			request,
			SingleEmbeddingResponse.class
		);
		return response.embedding().values();
	}

	@Override
	public List<List<Float>> embedDocuments(List<DocumentInput> documents) {
		if (documents.isEmpty()) {
			return List.of();
		}

		var requests = documents.stream()
			.map(document -> new EmbedContentRequest(
				modelName(),
				new Content(List.of(new Part(document.text()))),
				"RETRIEVAL_DOCUMENT",
				document.title()
			))
			.toList();

		var response = post(
			"/v1beta/models/" + this.ragProperties.getEmbedding().getModel() + ":batchEmbedContents",
			new BatchEmbedContentRequest(requests),
			BatchEmbeddingResponse.class
		);

		return response.embeddings().stream()
			.map(ContentEmbedding::values)
			.toList();
	}

	private <T> T post(String path, Object requestBody, Class<T> responseType) {
		if (!StringUtils.hasText(this.ragProperties.getEmbedding().getApiKey())) {
			throw new IllegalStateException("GEMINI_API_KEY is required for embeddings");
		}

		try {
			var request = HttpRequest.newBuilder(endpoint(path))
				.header("Content-Type", "application/json")
				.header("x-goog-api-key", this.ragProperties.getEmbedding().getApiKey())
				.POST(HttpRequest.BodyPublishers.ofString(
					this.objectMapper.writeValueAsString(requestBody)
				))
				.build();

			var response = this.httpClient.send(request, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				throw new IllegalStateException(
					"Gemini embeddings request failed with status " + response.statusCode()
				);
			}
			return this.objectMapper.readValue(response.body(), responseType);
		}
		catch (IOException exception) {
			throw new IllegalStateException("Failed to call Gemini embeddings API", exception);
		}
		catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Gemini embeddings request was interrupted", exception);
		}
	}

	private URI endpoint(String path) {
		var baseUrl = this.ragProperties.getEmbedding().getBaseUrl();
		var normalizedBaseUrl = baseUrl.endsWith("/")
			? baseUrl.substring(0, baseUrl.length() - 1)
			: baseUrl;
		return URI.create(normalizedBaseUrl + path);
	}

	private String modelName() {
		return "models/" + this.ragProperties.getEmbedding().getModel();
	}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	private record EmbedContentRequest(
		String model,
		Content content,
		String taskType,
		String title
	) {
	}

	private record BatchEmbedContentRequest(
		List<EmbedContentRequest> requests
	) {
	}

	private record Content(
		List<Part> parts
	) {
	}

	private record Part(
		String text
	) {
	}

	private record SingleEmbeddingResponse(
		ContentEmbedding embedding
	) {
	}

	private record BatchEmbeddingResponse(
		List<ContentEmbedding> embeddings
	) {
	}

	private record ContentEmbedding(
		List<Float> values
	) {
	}
}
