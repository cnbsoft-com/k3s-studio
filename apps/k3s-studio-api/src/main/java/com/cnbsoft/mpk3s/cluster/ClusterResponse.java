package com.cnbsoft.mpk3s.cluster;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
public class ClusterResponse {
    private Long id;
    private Long serverId;
    private String serverName;
    private String name;
    private String status;
    private String masterSpec;
    private Integer masterCpus;
    private String masterMemory;
    private String masterDisk;
    private Integer workerCount;
    private String ubuntuImage;
    private Map<String, Boolean> options;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public static ClusterResponse from(Cluster cluster) {
        ClusterResponse res = new ClusterResponse();
        res.setId(cluster.getId());
        res.setServerId(cluster.getServerId());
        res.setName(cluster.getName());
        res.setStatus(cluster.getStatus().name());
        res.setMasterSpec(cluster.getMasterSpec());
        res.setMasterCpus(cluster.getMasterCpus());
        res.setMasterMemory(cluster.getMasterMemory());
        res.setMasterDisk(cluster.getMasterDisk());
        res.setWorkerCount(cluster.getWorkerCount());
        res.setUbuntuImage(cluster.getUbuntuImage());
        res.setOptions(cluster.getOptions());
        res.setCreatedAt(cluster.getCreatedAt());
        res.setUpdatedAt(cluster.getUpdatedAt());
        return res;
    }
}
