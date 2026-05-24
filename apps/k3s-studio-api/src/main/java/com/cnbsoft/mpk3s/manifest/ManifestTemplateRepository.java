package com.cnbsoft.mpk3s.manifest;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ManifestTemplateRepository extends JpaRepository<ManifestTemplate, Long> {
    List<ManifestTemplate> findByClusterNameOrderByNameAsc(String clusterName);
    boolean existsByClusterNameAndName(String clusterName, String name);
    boolean existsByClusterNameAndNameAndIdNot(String clusterName, String name, Long excludeId);
}
