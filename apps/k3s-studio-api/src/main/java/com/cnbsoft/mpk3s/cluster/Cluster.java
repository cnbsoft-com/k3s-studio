package com.cnbsoft.mpk3s.cluster;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;

@Entity
@Table(name = "clusters")
@Getter
@Setter
@NoArgsConstructor
public class Cluster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    private Long serverId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClusterStatus status;

    private String masterSpec;
    private Integer masterCpus;
    private String masterMemory;
    private String masterDisk;

    @Column(columnDefinition = "int default 0")
    private Integer workerCount = 0;

    private String ubuntuImage;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Boolean> options;

    // 브리지 네트워크 (선택 사항) — null이면 기존 DHCP 동작
    @Column(nullable = true)
    private String networkInterface;

    @Column(nullable = true)
    private String networkInterfaceCidr;

    @Column(updatable = false)
    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
