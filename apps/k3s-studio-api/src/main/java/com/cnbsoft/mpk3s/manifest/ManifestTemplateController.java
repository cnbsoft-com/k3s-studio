package com.cnbsoft.mpk3s.manifest;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/manifests")
@RequiredArgsConstructor
public class ManifestTemplateController {

    private final ManifestTemplateService service;

    @GetMapping
    public List<ManifestTemplateResponse> list(@RequestParam String clusterName) {
        return service.findByCluster(clusterName).stream()
                .map(ManifestTemplateResponse::from)
                .toList();
    }

    @PostMapping
    public ResponseEntity<ManifestTemplateResponse> create(@RequestBody @Valid ManifestTemplateRequest req) {
        ManifestTemplate t = service.create(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(ManifestTemplateResponse.from(t));
    }

    @PutMapping("/{id}")
    public ManifestTemplateResponse update(
            @PathVariable Long id,
            @RequestBody @Valid ManifestTemplateUpdateRequest req) {
        return ManifestTemplateResponse.from(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
