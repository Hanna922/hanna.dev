package com.hannadev.rag.security;

import com.hannadev.rag.config.SecurityProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InternalApiKeyFilter extends OncePerRequestFilter {

	private final SecurityProperties securityProperties;

	public InternalApiKeyFilter(SecurityProperties securityProperties) {
		this.securityProperties = securityProperties;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		var path = request.getRequestURI();
		return path.startsWith("/actuator/health");
	}

	@Override
	protected boolean shouldNotFilterErrorDispatch() {
		return true;
	}

	@Override
	protected void doFilterInternal(
		HttpServletRequest request,
		HttpServletResponse response,
		FilterChain filterChain
	) throws ServletException, IOException {
		var path = request.getRequestURI();
		var requiredApiKey = resolveRequiredApiKey(path);

		if (requiredApiKey == null) {
			filterChain.doFilter(request, response);
			return;
		}

		var actualApiKey = request.getHeader(securityProperties.getHeaderName());

		if (!StringUtils.hasText(actualApiKey) || !requiredApiKey.equals(actualApiKey)) {
			response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized");
			return;
		}

		filterChain.doFilter(request, response);
	}

	private String resolveRequiredApiKey(String path) {
		if (path.startsWith("/v1/rag/")) {
			return securityProperties.getQueryApiKey();
		}

		if (path.startsWith("/internal/admin/")) {
			return securityProperties.getAdminApiKey();
		}

		return null;
	}
}
