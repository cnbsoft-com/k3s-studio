package com.cnbsoft.mpk3s.ai;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiModelConfigRepository extends JpaRepository<AiModelConfig, Long> {
    Optional<AiModelConfig> findFirstByActiveTrueOrderByIdAsc();

    List<AiModelConfig> findAllByOrderByIdAsc();
}
