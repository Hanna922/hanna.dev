package com.hannadev.rag.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
	webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
	properties = {
		"qdrant.bootstrap-enabled=false",
		"internal.query-api-key=query-secret",
		"internal.admin-api-key=admin-secret"
	}
)
class RagApiSecurityIntegrationTest {

	private static final String API_KEY_HEADER = "X-Internal-Api-Key";

	private final HttpClient httpClient = HttpClient.newHttpClient();

	@LocalServerPort
	private int port;

	@Test
	void healthEndpointIsPublic() throws IOException, InterruptedException {
		var response = sendGet("/actuator/health", null);

		assertEquals(200, response.statusCode());
		assertTrue(response.body().contains("\"status\":\"UP\""));
	}

	@Test
	void queryEndpointRejectsMissingApiKey() throws IOException, InterruptedException {
		var response = sendPost("/v1/rag/query", null, """
			{
			  "query": "대표 프로젝트 경험을 몇 가지 소개해주세요",
			  "locale": "ko",
			  "topK": 5
			}
			""");

		assertEquals(401, response.statusCode());
	}

	@Test
	void queryEndpointReturnsPlaceholderContractForValidApiKey()
		throws IOException, InterruptedException {
		var response = sendPost("/v1/rag/query", "query-secret", """
			{
			  "query": "대표 프로젝트 경험을 몇 가지 소개해주세요",
			  "locale": "ko",
			  "topK": 5
			}
			""");

		assertEquals(501, response.statusCode());
		assertTrue(response.body().contains("\"context\":\"\""));
		assertTrue(response.body().contains("\"sources\":[]"));
		assertTrue(response.body().contains("\"topK\":5"));
		assertTrue(response.body().contains("\"returned\":0"));
	}

	@Test
	void adminEndpointRejectsWrongApiKey() throws IOException, InterruptedException {
		var response = sendPost("/internal/admin/index/full-sync", "query-secret", """
			{
			  "syncId": "2026-04-03T09:00:00+09:00",
			  "replaceMissing": false,
			  "documents": []
			}
			""");

		assertEquals(401, response.statusCode());
	}

	@Test
	void adminEndpointReturnsPlaceholderContractForValidApiKey()
		throws IOException, InterruptedException {
		var response = sendPost("/internal/admin/index/full-sync", "admin-secret", """
			{
			  "syncId": "2026-04-03T09:00:00+09:00",
			  "replaceMissing": false,
			  "documents": []
			}
			""");

		assertEquals(200, response.statusCode());
		assertTrue(response.body().contains("\"total\":0"));
		assertTrue(response.body().contains("\"inserted\":0"));
		assertTrue(response.body().contains("\"updated\":0"));
		assertTrue(response.body().contains("\"deleted\":0"));
		assertTrue(response.body().contains("\"skipped\":0"));
	}

	private HttpResponse<String> sendGet(String path, String apiKey)
		throws IOException, InterruptedException {
		var requestBuilder = HttpRequest.newBuilder()
			.uri(URI.create("http://localhost:" + port + path))
			.GET();

		if (apiKey != null) {
			requestBuilder.header(API_KEY_HEADER, apiKey);
		}

		return httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> sendPost(String path, String apiKey, String body)
		throws IOException, InterruptedException {
		var requestBuilder = HttpRequest.newBuilder()
			.uri(URI.create("http://localhost:" + port + path))
			.header("Content-Type", "application/json")
			.POST(HttpRequest.BodyPublishers.ofString(body));

		if (apiKey != null) {
			requestBuilder.header(API_KEY_HEADER, apiKey);
		}

		return httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
	}
}
