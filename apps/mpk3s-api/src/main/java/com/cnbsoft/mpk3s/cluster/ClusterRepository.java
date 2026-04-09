package com.cnbsoft.mpk3s.cluster;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ClusterRepository extends JpaRepository<Cluster, Long> {
    Optional<Cluster> findByName(String name);
    boolean existsByName(String name);
    List<Cluster> findByServerId(Long serverId);
}
