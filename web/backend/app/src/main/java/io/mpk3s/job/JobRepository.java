package io.mpk3s.job;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface JobRepository extends JpaRepository<Job, UUID> {
    List<Job> findByClusterNameOrderByCreatedAtDesc(String clusterName);
}
