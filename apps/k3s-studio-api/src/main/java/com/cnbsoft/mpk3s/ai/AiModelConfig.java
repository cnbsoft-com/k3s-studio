package com.cnbsoft.mpk3s.ai;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "ai_model_config")
public class AiModelConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String modelUrl;

    @Column(nullable = false)
    private String modelName;
}
