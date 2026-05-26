package com.cnbsoft.mpk3s.ai;

import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByConversationIdOrderByCreatedAtAsc(Long conversationId);

    @Transactional
    void deleteByConversationId(Long conversationId);
}
