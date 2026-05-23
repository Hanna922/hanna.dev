package com.hannadev.rag.qdrant;

import com.hannadev.rag.config.QdrantProperties;
import com.hannadev.rag.config.RagProperties;
import com.google.common.util.concurrent.ListenableFuture;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Collections.Distance;
import io.qdrant.client.grpc.Collections.PayloadSchemaType;
import io.qdrant.client.grpc.Collections.VectorParams;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ExecutionException;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration
@EnableConfigurationProperties({QdrantProperties.class, RagProperties.class})
public class QdrantCollectionInitializer {

	private QdrantClient qdrantClient;

	@Bean
	QdrantClient qdrantClient(QdrantProperties properties) {
		var builder = QdrantGrpcClient.newBuilder(
			properties.getHost(),
			properties.getGrpcPort(),
			properties.isUseTls()
		);

		if (StringUtils.hasText(properties.getApiKey())) {
			builder.withApiKey(properties.getApiKey());
		}

		this.qdrantClient = new QdrantClient(builder.build());
		return this.qdrantClient;
	}

	@Bean
	@ConditionalOnProperty(
		prefix = "qdrant",
		name = "bootstrap-enabled",
		havingValue = "true",
		matchIfMissing = true
	)
	ApplicationRunner initializeQdrantCollection(
		QdrantClient client,
		QdrantProperties qdrantProperties,
		RagProperties ragProperties
	) {
		return args -> {
			ensureCollection(client, qdrantProperties, ragProperties);
			ensureKeywordIndex(client, qdrantProperties.getCollection(), "docId");
			ensureKeywordIndex(client, qdrantProperties.getCollection(), "baseSlug");
			ensureKeywordIndex(client, qdrantProperties.getCollection(), "locale");
			ensureKeywordIndex(client, qdrantProperties.getCollection(), "sourceType");
			ensureDatetimeIndex(client, qdrantProperties.getCollection(), "publishedAt");
		};
	}

	private void ensureCollection(
		QdrantClient client,
		QdrantProperties qdrantProperties,
		RagProperties ragProperties
	) throws ExecutionException, InterruptedException {
		var exists = client.collectionExistsAsync(qdrantProperties.getCollection()).get();
		if (exists) {
			return;
		}

		await(client.createCollectionAsync(
			qdrantProperties.getCollection(),
			VectorParams.newBuilder()
				.setDistance(Distance.Cosine)
				.setSize(ragProperties.getEmbedding().getDimension())
				.build()
		));
	}

	private void ensureKeywordIndex(QdrantClient client, String collection, String fieldName)
		throws ExecutionException, InterruptedException {
		await(client.createPayloadIndexAsync(
			collection,
			fieldName,
			PayloadSchemaType.Keyword,
			null,
			Boolean.TRUE,
			null,
			null
		));
	}

	private void ensureDatetimeIndex(QdrantClient client, String collection, String fieldName)
		throws ExecutionException, InterruptedException {
		await(client.createPayloadIndexAsync(
			collection,
			fieldName,
			PayloadSchemaType.Datetime,
			null,
			Boolean.TRUE,
			null,
			null
		));
	}

	private <T> T await(ListenableFuture<T> future)
		throws ExecutionException, InterruptedException {
		return future.get();
	}

	@PreDestroy
	void closeClient() {
		if (this.qdrantClient != null) {
			this.qdrantClient.close();
		}
	}
}
