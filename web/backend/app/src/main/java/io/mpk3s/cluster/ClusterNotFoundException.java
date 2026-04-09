package io.mpk3s.cluster;

public class ClusterNotFoundException extends RuntimeException {
    public ClusterNotFoundException(String name) {
        super("Cluster not found: " + name);
    }
}
