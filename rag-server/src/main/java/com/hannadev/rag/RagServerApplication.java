package com.hannadev.rag;

import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@ConfigurationPropertiesScan
public class RagServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(RagServerApplication.class, args);
	}

}
