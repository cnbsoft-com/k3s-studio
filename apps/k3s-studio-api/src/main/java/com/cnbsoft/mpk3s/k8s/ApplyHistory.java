package com.cnbsoft.mpk3s.k8s;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "apply_history")
@Getter @Setter @NoArgsConstructor
public class ApplyHistory {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cluster_name", nullable = false)
    private String clusterName;

    @Column(nullable = false)
    private String action; // "apply" | "delete"

    @Column(name = "yaml_content", nullable = false, columnDefinition = "TEXT")
    private String yamlContent;

    @Column(nullable = false)
    private String result; // "success" | "failed"

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "executed_at", nullable = false)
    private OffsetDateTime executedAt;
}
