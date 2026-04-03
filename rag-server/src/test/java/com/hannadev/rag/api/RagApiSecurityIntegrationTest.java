package com.hannadev.rag.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.hannadev.rag.api.dto.RagQueryRequest;
import com.hannadev.rag.api.dto.RagQueryResponse;
import com.hannadev.rag.service.RagQueryUseCase;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@SpringBootTest(
	webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
	classes = {
		com.hannadev.rag.RagServerApplication.class,
		RagApiSecurityIntegrationTest.QueryTestConfiguration.class
	},
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

		assertEquals(200, response.statusCode());
		assertTrue(response.body().contains("\"context\":\"stub context\""));
		assertTrue(response.body().contains("\"docId\":\"stub-doc\""));
		assertTrue(response.body().contains("\"topK\":5"));
		assertTrue(response.body().contains("\"returned\":1"));
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

	@TestConfiguration
	static class QueryTestConfiguration {

		@Bean
		@Primary
		RagQueryUseCase ragQueryUseCase() {
			return new RagQueryUseCase() {
				@Override
				public RagQueryResponse query(RagQueryRequest request) {
					return new RagQueryResponse(
						"stub context",
						List.of(new RagQueryResponse.SourceRef(
							"stub-doc",
							"Stub title",
							"https://hanna.dev/stub-doc",
							0.91d,
							request.locale(),
							"custom"
						)),
						new RagQueryResponse.RetrievalMetadata(request.topK(), 1, 1)
					);
				}
			};
		}
	}
}
