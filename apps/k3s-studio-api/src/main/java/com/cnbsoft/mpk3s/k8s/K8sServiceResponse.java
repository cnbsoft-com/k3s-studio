package com.cnbsoft.mpk3s.k8s;

public record K8sServiceResponse(
        String name,
        String namespace,
        String type,
        String clusterIp,
        String ports,
        String age
) {}
