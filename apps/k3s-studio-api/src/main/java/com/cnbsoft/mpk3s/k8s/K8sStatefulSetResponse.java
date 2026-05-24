package com.cnbsoft.mpk3s.k8s;

public record K8sStatefulSetResponse(
        String name,
        String namespace,
        String ready,
        String age
) {}
