package io.mpk3s.job;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
public class JobResponse {
    private UUID id;
    private String clusterName;
    private String type;
    private String status;
    private String log;
    private OffsetDateTime createdAt;
    private OffsetDateTime finishedAt;

    public static JobResponse from(Job job) {
        JobResponse res = new JobResponse();
        res.setId(job.getId());
        res.setClusterName(job.getClusterName());
        res.setType(job.getType().name());
        res.setStatus(job.getStatus().name());
        res.setLog(job.getLog());
        res.setCreatedAt(job.getCreatedAt());
        res.setFinishedAt(job.getFinishedAt());
        return res;
    }
}
