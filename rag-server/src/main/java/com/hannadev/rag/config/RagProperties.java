package com.hannadev.rag.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rag")
public class RagProperties {

	private final Embedding embedding = new Embedding();

	private int topK = 5;

	private int contextMaxChars = 12000;

	public Embedding getEmbedding() {
		return embedding;
	}

	public int getTopK() {
		return topK;
	}

	public void setTopK(int topK) {
		this.topK = topK;
	}

	public int getContextMaxChars() {
		return contextMaxChars;
	}

	public void setContextMaxChars(int contextMaxChars) {
		this.contextMaxChars = contextMaxChars;
	}

	public static class Embedding {

		private String model = "gemini-embedding-001";

		private int dimension = 3072;

		private String baseUrl = "https://generativelanguage.googleapis.com";

		private String apiKey;

		public String getModel() {
			return model;
		}

		public void setModel(String model) {
			this.model = model;
		}

		public int getDimension() {
			return dimension;
		}

		public void setDimension(int dimension) {
			this.dimension = dimension;
		}

		public String getBaseUrl() {
			return baseUrl;
		}

		public void setBaseUrl(String baseUrl) {
			this.baseUrl = baseUrl;
		}

		public String getApiKey() {
			return apiKey;
		}

		public void setApiKey(String apiKey) {
			this.apiKey = apiKey;
		}
	}
}
