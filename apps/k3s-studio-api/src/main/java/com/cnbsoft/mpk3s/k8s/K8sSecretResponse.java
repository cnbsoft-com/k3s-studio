package com.cnbsoft.mpk3s.k8s;

public record K8sSecretResponse(
        String name,
        String namespace,
        String type,
        int dataCount,
        String age
) {}
