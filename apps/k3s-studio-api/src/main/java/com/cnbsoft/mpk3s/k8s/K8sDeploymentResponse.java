package com.cnbsoft.mpk3s.k8s;

public record K8sDeploymentResponse(
        String name,
        String namespace,
        String ready,
        int upToDate,
        int available,
        String age
) {}
