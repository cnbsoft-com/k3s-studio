package io.mpk3s;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class Mpk3sApplication {
    public static void main(String[] args) {
        SpringApplication.run(Mpk3sApplication.class, args);
    }
}
