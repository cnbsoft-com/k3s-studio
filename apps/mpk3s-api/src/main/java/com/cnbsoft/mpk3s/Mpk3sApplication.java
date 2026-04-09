package com.cnbsoft.mpk3s;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class Mpk3sApplication {
    public static void main(String[] args) {
        SpringApplication.run(Mpk3sApplication.class, args);
    }
}
