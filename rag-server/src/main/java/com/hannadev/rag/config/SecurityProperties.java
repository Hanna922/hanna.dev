package com.hannadev.rag.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "internal")
public class SecurityProperties {

	private String headerName = "X-Internal-Api-Key";

	private String queryApiKey = "change-me";

	private String adminApiKey = "change-me";

	public String getHeaderName() {
		return headerName;
	}

	public void setHeaderName(String headerName) {
		this.headerName = headerName;
	}

	public String getQueryApiKey() {
		return queryApiKey;
	}

	public void setQueryApiKey(String queryApiKey) {
		this.queryApiKey = queryApiKey;
	}

	public String getAdminApiKey() {
		return adminApiKey;
	}

	public void setAdminApiKey(String adminApiKey) {
		this.adminApiKey = adminApiKey;
	}
}
