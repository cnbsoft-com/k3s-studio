package com.cnbsoft.mpk3s.k8s;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/clusters/{name}/k8s")
@RequiredArgsConstructor
public class K8sController {

    private final K8sService k8sService;

    @GetMapping("/namespaces")
    public List<String> getNamespaces(@PathVariable String name) throws IOException {
        return k8sService.getNamespaces(name);
    }

    @GetMapping("/pods")
    public List<K8sPodResponse> getPods(
            @PathVariable String name,
            @RequestParam(defaultValue = "all") String namespace) throws IOException {
        return k8sService.getPods(name, namespace);
    }

    @GetMapping("/services")
    public List<K8sServiceResponse> getServices(
            @PathVariable String name,
            @RequestParam(defaultValue = "all") String namespace) throws IOException {
        return k8sService.getServices(name, namespace);
    }

    @GetMapping("/deployments")
    public List<K8sDeploymentResponse> getDeployments(
            @PathVariable String name,
            @RequestParam(defaultValue = "all") String namespace) throws IOException {
        return k8sService.getDeployments(name, namespace);
    }

    @GetMapping("/configmaps")
    public List<K8sConfigMapResponse> getConfigMaps(
            @PathVariable String name,
            @RequestParam(defaultValue = "all") String namespace) throws IOException {
        return k8sService.getConfigMaps(name, namespace);
    }

    @GetMapping("/{type}/{namespace}/{resourceName}/manifest")
    public Map<String, String> getManifest(
            @PathVariable String name,
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String resourceName) throws IOException {
        String yaml = k8sService.getResourceManifest(name, type, namespace, resourceName);
        return Map.of("yaml", yaml);
    }

    @PostMapping("/apply")
    public ResponseEntity<Void> applyManifest(
            @PathVariable String name,
            @RequestBody Map<String, String> body) throws IOException {
        k8sService.applyManifest(name, body.get("yaml"));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> deleteManifest(
            @PathVariable String name,
            @RequestBody Map<String, String> body) throws IOException {
        k8sService.deleteManifest(name, body.get("yaml"));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/apply-history")
    public List<ApplyHistoryResponse> getApplyHistory(@PathVariable String name) throws IOException {
        return k8sService.getApplyHistory(name);
    }
}
