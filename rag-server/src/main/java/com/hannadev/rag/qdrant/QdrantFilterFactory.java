package com.hannadev.rag.qdrant;

import io.qdrant.client.ConditionFactory;
import io.qdrant.client.grpc.Common;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

@Component
public class QdrantFilterFactory {

	public Common.Filter forLocales(List<String> locales) {
		if (CollectionUtils.isEmpty(locales)) {
			return null;
		}

		return Common.Filter.newBuilder()
			.addMust(ConditionFactory.matchKeywords("locale", locales))
			.build();
	}
}
