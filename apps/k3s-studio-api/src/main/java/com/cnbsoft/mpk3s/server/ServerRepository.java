package com.cnbsoft.mpk3s.server;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ServerRepository extends JpaRepository<Server, Long> {
    Optional<Server> findByLocal(boolean local);
    Optional<Server> findByName(String name);
    boolean existsByName(String name);
}
