package com.cnbsoft.mpk3s.k8s;

import java.time.OffsetDateTime;

public record ApplyHistoryResponse(
        Long id,
        String action,
        String result,
        String errorMessage,
        String yamlContent,
        OffsetDateTime executedAt
) {
    static ApplyHistoryResponse from(ApplyHistory h) {
        return new ApplyHistoryResponse(
                h.getId(), h.getAction(), h.getResult(),
                h.getErrorMessage(), h.getYamlContent(), h.getExecutedAt()
        );
    }
}
