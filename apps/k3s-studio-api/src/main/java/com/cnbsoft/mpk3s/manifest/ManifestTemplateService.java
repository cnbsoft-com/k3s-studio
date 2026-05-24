package com.cnbsoft.mpk3s.manifest;

import com.cnbsoft.mpk3s.common.DuplicateNameException;
import com.cnbsoft.mpk3s.common.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ManifestTemplateService {

    private final ManifestTemplateRepository repository;

    @Transactional(readOnly = true)
    public List<ManifestTemplate> findByCluster(String clusterName) {
        return repository.findByClusterNameOrderByNameAsc(clusterName);
    }

    public ManifestTemplate create(ManifestTemplateRequest req) {
        if (repository.existsByClusterNameAndName(req.clusterName(), req.name())) {
            throw new DuplicateNameException(req.name());
        }
        ManifestTemplate t = new ManifestTemplate();
        t.setClusterName(req.clusterName());
        t.setName(req.name());
        t.setDescription(req.description());
        t.setYamlContent(req.yamlContent());
        return repository.save(t);
    }

    public ManifestTemplate update(Long id, ManifestTemplateUpdateRequest req) {
        ManifestTemplate t = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Manifest template not found: " + id));
        if (!t.getName().equals(req.name()) &&
                repository.existsByClusterNameAndNameAndIdNot(t.getClusterName(), req.name(), id)) {
            throw new DuplicateNameException(req.name());
        }
        t.setName(req.name());
        t.setDescription(req.description());
        t.setYamlContent(req.yamlContent());
        return repository.save(t);
    }

    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Manifest template not found: " + id);
        }
        repository.deleteById(id);
    }
}
