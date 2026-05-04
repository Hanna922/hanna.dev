package com.hannadev.rag.service;

import com.hannadev.rag.api.dto.RagDocumentDto;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.stereotype.Service;

@Service
public class ContentHashService {

	public String hash(RagDocumentDto document) {
		try {
			var digest = MessageDigest.getInstance("SHA-256");
			var canonicalContent = String.join("\n",
				"docId=" + value(document.docId()),
				"locale=" + value(document.locale()),
				"title=" + value(document.title()),
				"titleEn=" + value(document.titleEn()),
				"description=" + value(document.description()),
				"url=" + value(document.url()),
				"tags=" + String.join(",", document.tags() == null ? java.util.List.of() : document.tags()),
				"sourceType=" + value(document.sourceType()),
				"publishedAt=" + value(document.publishedAt()),
				"fullText=" + value(document.fullText())
			);
			return HexFormat.of().formatHex(
				digest.digest(canonicalContent.getBytes(StandardCharsets.UTF_8))
			);
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is not available", exception);
		}
	}

	private String value(String input) {
		return input == null ? "" : input;
	}
}
