package com.cnbsoft.mpk3s.k8s;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ApplyHistoryRepository extends JpaRepository<ApplyHistory, Long> {
    List<ApplyHistory> findTop20ByClusterNameOrderByExecutedAtDesc(String clusterName);
}
