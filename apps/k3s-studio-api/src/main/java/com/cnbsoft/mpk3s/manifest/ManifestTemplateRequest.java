package com.cnbsoft.mpk3s.manifest;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ManifestTemplateRequest(
        @NotBlank String clusterName,
        @NotBlank @Size(max = 100) String name,
        @Size(max = 200) String description,
        @NotBlank String yamlContent
) {}
