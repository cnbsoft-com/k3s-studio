package com.cnbsoft.mpk3s.job;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "jobs")
@Getter
@Setter
@NoArgsConstructor
public class Job {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String clusterName;

    private Long serverId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobStatus status;

    @Column(columnDefinition = "TEXT")
    private String log;

    @Column(updatable = false)
    private OffsetDateTime createdAt;

    private OffsetDateTime finishedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }

    public void appendLog(String line) {
        if (this.log == null) {
            this.log = line + "\n";
        } else {
            this.log = this.log + line + "\n";
        }
    }
}
