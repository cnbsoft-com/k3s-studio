package com.cnbsoft.mpk3s.cluster;

import com.cnbsoft.mpk3s.common.AppException;

public class ClusterNotFoundException extends AppException {
    public ClusterNotFoundException(String name) {
        super("error.cluster_not_found", name);
    }
}
