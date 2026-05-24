package com.cnbsoft.mpk3s.cluster;

public record SetHardwareRequest(
        Integer cpus,
        String memory,
        String disk
) {}
