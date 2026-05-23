package com.cnbsoft.mpk3s.server;

import lombok.Data;

import java.time.OffsetDateTime;

@Data
public class ServerResponse {

    private Long id;
    private String name;
    private String host;
    private Integer port;
    private String username;
    private boolean local;
    private String status;
    private String multipassVersion;
    private OffsetDateTime lastSeenAt;
    private OffsetDateTime createdAt;

    public static ServerResponse from(Server server) {
        ServerResponse res = new ServerResponse();
        res.setId(server.getId());
        res.setName(server.getName());
        res.setHost(server.getHost());
        res.setPort(server.getPort());
        res.setUsername(server.getUsername());
        res.setLocal(server.isLocal());
        res.setStatus(server.getStatus().name());
        res.setLastSeenAt(server.getLastSeenAt());
        res.setCreatedAt(server.getCreatedAt());
        return res;
    }
}
