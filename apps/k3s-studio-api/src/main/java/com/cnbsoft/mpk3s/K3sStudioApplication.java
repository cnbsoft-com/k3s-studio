package com.cnbsoft.mpk3s;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class K3sStudioApplication {
    public static void main(String[] args) {
        SpringApplication.run(K3sStudioApplication.class, args);
    }
}
