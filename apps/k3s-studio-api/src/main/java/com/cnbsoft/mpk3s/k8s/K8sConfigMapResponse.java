package com.cnbsoft.mpk3s.k8s;

public record K8sConfigMapResponse(
        String name,
        String namespace,
        int data,
        String age
) {}
