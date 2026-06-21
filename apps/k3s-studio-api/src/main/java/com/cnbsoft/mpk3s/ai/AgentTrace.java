package com.cnbsoft.mpk3s.ai;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;

/**
 * 파인튜닝 학습 데이터 수집용 trace (Phase 0).
 * 어시스턴트 턴마다 구조화된 전체 messages(도구 호출·결과 포함)와
 * 자동 라벨 신호(confirm/cancel/toolError/rating)를 보존한다.
 * 참고: PLAN-AI-FINETUNE.md
 */
@Data
@Entity
@Table(name = "ai_agent_trace")
public class AgentTrace {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long conversationId;

    /** 대화 내 이 턴의 순번 (0-base) */
    private Integer turnIndex;

    private String modelName;

    /** 도구 스키마 해시 — 스키마 드리프트 추적용 (이전 스키마 trace 필터링) */
    private String toolSchemaHash;

    @Column(columnDefinition = "TEXT")
    private String userMessage;

    /** system+history+user+assistant(tool_calls)+tool 결과+최종 답변 전체 배열 (학습 입력) */
    @Column(columnDefinition = "TEXT")
    private String messagesJson;

    /** 당시 서버/클러스터 상태 스냅샷 (입력 컨텍스트용, 가중치 학습 대상 아님) */
    @Column(columnDefinition = "TEXT")
    private String envSnapshotJson;

    private String finishReason;

    private Integer roundCount;

    /** 도구 실행 중 하나라도 오류가 났는지 (자동 부정 신호) */
    private Boolean toolError;

    /** 파괴적 작업 미리보기를 사용자가 승인했는지 (자동 긍정 신호) */
    private Boolean confirmed;

    /** 파괴적 작업 미리보기를 사용자가 취소했는지 (자동 부정 신호) */
    private Boolean cancelled;

    /** 사용자 평가: "up" | "down" | null */
    private String userRating;

    /** 학습 데이터셋에서 제외 */
    @Column(nullable = false)
    private boolean excluded = false;

    @CreationTimestamp
    private OffsetDateTime createdAt;
}
