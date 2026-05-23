package com.cnbsoft.mpk3s.cluster;

public record DiscoveredCluster(
        String name,
        int workerCount,
        String masterIp
) {}
