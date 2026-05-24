package com.cnbsoft.mpk3s.k8s;

public record K8sPodResponse(
        String name,
        String namespace,
        String status,
        String ready,
        String age,
        String hostIp
) {}
