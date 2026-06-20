package com.cnbsoft.mpk3s.ai;

import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AgentTraceRepository extends JpaRepository<AgentTrace, Long> {
    int countByConversationId(Long conversationId);

    /** 가장 최근 trace — confirm/cancel은 직전 미리보기 턴에 즉시 이어지므로 최신 trace가 그 대상 */
    Optional<AgentTrace> findFirstByConversationIdOrderByCreatedAtDesc(Long conversationId);

    @Transactional
    void deleteByConversationId(Long conversationId);
}
