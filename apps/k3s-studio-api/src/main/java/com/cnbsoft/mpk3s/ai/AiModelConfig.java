package com.cnbsoft.mpk3s.ai;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "ai_model_config")
public class AiModelConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 프로파일 라벨 (예: "rapid-mlx", "ollama-local"). 비면 modelName으로 대체 표시 */
    private String name;

    @Column(nullable = false)
    private String modelUrl;

    @Column(nullable = false)
    private String modelName;

    /** 이 프로파일을 채팅에 사용할지 여부. 단 하나만 true 유지 */
    @Column(nullable = false)
    private boolean active = false;

    /** OpenAI 호환 API 키 (로컬 서버는 비움). 쓰기 전용 — 목록/조회 응답엔 노출하지 않음 */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String apiKey;

    /** 클라이언트 표시용 — 키 설정 여부만 노출 (값은 노출 안 함) */
    @Transient
    public boolean isHasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
