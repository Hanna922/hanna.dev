package com.hannadev.rag;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "qdrant.bootstrap-enabled=false")
class RagServerApplicationTests {

	@Test
	void contextLoads() {
	}

}
