package com.cnbsoft.mpk3s.server;

public class ServerNotFoundException extends RuntimeException {
    public ServerNotFoundException(Long id) {
        super("Server not found: " + id);
    }
}
