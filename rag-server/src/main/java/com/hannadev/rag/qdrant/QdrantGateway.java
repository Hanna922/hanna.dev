package com.hannadev.rag.qdrant;

import io.qdrant.client.grpc.Common;
import io.qdrant.client.grpc.Points;
import java.util.List;

public interface QdrantGateway {

	void upsert(String collectionName, List<Points.PointStruct> points);

	void delete(String collectionName, List<Common.PointId> pointIds);

	Points.ScrollResponse scroll(Points.ScrollPoints request);

	List<Points.ScoredPoint> query(Points.QueryPoints request);

	long count(String collectionName);
}
