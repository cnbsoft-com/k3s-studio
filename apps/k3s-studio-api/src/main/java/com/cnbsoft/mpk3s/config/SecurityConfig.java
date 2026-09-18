package com.cnbsoft.mpk3s.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Keycloak JWT 검증(OAuth2 Resource Server). issuer-uri가 비어 있으면 기동을 거부한다 —
 * 인증 없이 열린 채 뜨는 것보다 죽는 편이 안전하다.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    public SecurityConfig(@Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}") String issuerUri) {
        if (issuerUri == null || issuerUri.isBlank()) {
            throw new IllegalStateException(
                    "KEYCLOAK_ISSUER_URI가 비어 있습니다 (예: https://keycloak.cnbsoft.com/realms/cnb)");
        }
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/actuator/health", "/api/i18n/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));
        return http.build();
    }
}
