package com.hannadev.rag.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "qdrant")
public class QdrantProperties {

	private String host = "localhost";

	private int grpcPort = 6334;

	private String apiKey;

	private boolean useTls = false;

	private String collection = "hanna-dev-documents";

	private boolean bootstrapEnabled = true;

	public String getHost() {
		return host;
	}

	public void setHost(String host) {
		this.host = host;
	}

	public int getGrpcPort() {
		return grpcPort;
	}

	public void setGrpcPort(int grpcPort) {
		this.grpcPort = grpcPort;
	}

	public String getApiKey() {
		return apiKey;
	}

	public void setApiKey(String apiKey) {
		this.apiKey = apiKey;
	}

	public boolean isUseTls() {
		return useTls;
	}

	public void setUseTls(boolean useTls) {
		this.useTls = useTls;
	}

	public String getCollection() {
		return collection;
	}

	public void setCollection(String collection) {
		this.collection = collection;
	}

	public boolean isBootstrapEnabled() {
		return bootstrapEnabled;
	}

	public void setBootstrapEnabled(boolean bootstrapEnabled) {
		this.bootstrapEnabled = bootstrapEnabled;
	}
}
