package com.cnbsoft.mpk3s.manifest;

import java.time.OffsetDateTime;

public record ManifestTemplateResponse(
        Long id,
        String clusterName,
        String name,
        String description,
        String yamlContent,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
    public static ManifestTemplateResponse from(ManifestTemplate t) {
        return new ManifestTemplateResponse(
                t.getId(), t.getClusterName(), t.getName(), t.getDescription(),
                t.getYamlContent(), t.getCreatedAt(), t.getUpdatedAt()
        );
    }
}
