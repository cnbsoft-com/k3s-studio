package com.cnbsoft.mpk3s.server;

import com.cnbsoft.mpk3s.common.AppException;

public class ServerNotFoundException extends AppException {
    public ServerNotFoundException(Long id) {
        super("error.server_not_found", id);
    }
}
