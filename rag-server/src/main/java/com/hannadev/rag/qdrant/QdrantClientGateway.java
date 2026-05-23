package com.hannadev.rag.qdrant;

import com.google.common.util.concurrent.ListenableFuture;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.grpc.Common;
import io.qdrant.client.grpc.Points;
import java.util.List;
import java.util.concurrent.ExecutionException;
import org.springframework.stereotype.Component;

@Component
public class QdrantClientGateway implements QdrantGateway {

	private final QdrantClient qdrantClient;

	public QdrantClientGateway(QdrantClient qdrantClient) {
		this.qdrantClient = qdrantClient;
	}

	@Override
	public void upsert(String collectionName, List<Points.PointStruct> points) {
		await(this.qdrantClient.upsertAsync(collectionName, points));
	}

	@Override
	public void delete(String collectionName, List<Common.PointId> pointIds) {
		await(this.qdrantClient.deleteAsync(collectionName, pointIds));
	}

	@Override
	public Points.ScrollResponse scroll(Points.ScrollPoints request) {
		return await(this.qdrantClient.scrollAsync(request));
	}

	@Override
	public List<Points.ScoredPoint> query(Points.QueryPoints request) {
		return await(this.qdrantClient.queryAsync(request));
	}

	@Override
	public long count(String collectionName) {
		return await(this.qdrantClient.countAsync(collectionName));
	}

	private <T> T await(ListenableFuture<T> future) {
		try {
			return future.get();
		}
		catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Qdrant request was interrupted", exception);
		}
		catch (ExecutionException exception) {
			throw new IllegalStateException("Qdrant request failed", exception);
		}
	}
}
