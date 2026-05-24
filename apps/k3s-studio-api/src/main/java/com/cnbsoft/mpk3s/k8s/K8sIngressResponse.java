package com.cnbsoft.mpk3s.k8s;

public record K8sIngressResponse(
        String name,
        String namespace,
        String hosts,
        String age
) {}
