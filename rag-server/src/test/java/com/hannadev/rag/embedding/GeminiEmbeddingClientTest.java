package com.hannadev.rag.embedding;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertIterableEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hannadev.rag.config.RagProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GeminiEmbeddingClientTest {

	private final ObjectMapper objectMapper = new ObjectMapper();

	private HttpServer server;

	private String baseUrl;

	@BeforeEach
	void setUp() throws IOException {
		this.server = HttpServer.create(new InetSocketAddress(0), 0);
		this.server.start();
		this.baseUrl = "http://localhost:" + this.server.getAddress().getPort();
	}

	@AfterEach
	void tearDown() {
		if (this.server != null) {
			this.server.stop(0);
		}
	}

	@Test
	void embedsQueryUsingRetrievalQueryTaskType() throws Exception {
		var capturedBody = new AtomicReference<JsonNode>();
		this.server.createContext("/v1beta/models/gemini-embedding-001:embedContent", exchange -> {
			capturedBody.set(this.objectMapper.readTree(exchange.getRequestBody()));
			assertEquals("test-key", exchange.getRequestHeaders().getFirst("x-goog-api-key"));
			respondJson(exchange, """
				{
				  "embedding": {
				    "values": [0.1, 0.2, 0.3]
				  }
				}
				""");
		});

		var client = new GeminiEmbeddingClient(
			HttpClient.newHttpClient(),
			this.objectMapper,
			ragProperties()
		);

		var embedding = client.embedQuery("representative projects");

		assertIterableEquals(List.of(0.1f, 0.2f, 0.3f), embedding);
		assertEquals(
			"models/gemini-embedding-001",
			capturedBody.get().get("model").asText()
		);
		assertEquals(
			"RETRIEVAL_QUERY",
			capturedBody.get().get("taskType").asText()
		);
		assertEquals(
			"representative projects",
			capturedBody.get().at("/content/parts/0/text").asText()
		);
	}

	@Test
	void embedsDocumentsInBatchUsingRetrievalDocumentTaskType() throws Exception {
		var capturedBody = new AtomicReference<JsonNode>();
		this.server.createContext("/v1beta/models/gemini-embedding-001:batchEmbedContents", exchange -> {
			capturedBody.set(this.objectMapper.readTree(exchange.getRequestBody()));
			assertEquals("test-key", exchange.getRequestHeaders().getFirst("x-goog-api-key"));
			respondJson(exchange, """
				{
				  "embeddings": [
				    { "values": [1.0, 2.0] },
				    { "values": [3.0, 4.0] }
				  ]
				}
				""");
		});

		var client = new GeminiEmbeddingClient(
			HttpClient.newHttpClient(),
			this.objectMapper,
			ragProperties()
		);

		var embeddings = client.embedDocuments(List.of(
			new EmbeddingService.DocumentInput("Project Timeline", "Timeline body"),
			new EmbeddingService.DocumentInput(null, "Second body")
		));

		assertEquals(2, embeddings.size());
		assertIterableEquals(List.of(1.0f, 2.0f), embeddings.get(0));
		assertIterableEquals(List.of(3.0f, 4.0f), embeddings.get(1));
		assertEquals(
			"RETRIEVAL_DOCUMENT",
			capturedBody.get().at("/requests/0/taskType").asText()
		);
		assertEquals(
			"models/gemini-embedding-001",
			capturedBody.get().at("/requests/0/model").asText()
		);
		assertEquals(
			"Project Timeline",
			capturedBody.get().at("/requests/0/title").asText()
		);
		assertEquals(
			"Timeline body",
			capturedBody.get().at("/requests/0/content/parts/0/text").asText()
		);
		assertFalse(capturedBody.get().get("requests").get(1).has("title"));
	}

	private RagProperties ragProperties() {
		var properties = new RagProperties();
		properties.getEmbedding().setModel("gemini-embedding-001");
		properties.getEmbedding().setDimension(3072);
		properties.getEmbedding().setApiKey("test-key");
		properties.getEmbedding().setBaseUrl(this.baseUrl);
		return properties;
	}

	private void respondJson(HttpExchange exchange, String body) throws IOException {
		var bytes = body.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", "application/json");
		exchange.sendResponseHeaders(200, bytes.length);
		try (var responseBody = exchange.getResponseBody()) {
			responseBody.write(bytes);
		}
	}
}
