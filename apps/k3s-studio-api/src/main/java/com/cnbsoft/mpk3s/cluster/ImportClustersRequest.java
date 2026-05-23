package com.cnbsoft.mpk3s.cluster;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class ImportClustersRequest {

    @NotNull
    private Long serverId;

    @NotNull
    private List<DiscoveredCluster> clusters;
}
