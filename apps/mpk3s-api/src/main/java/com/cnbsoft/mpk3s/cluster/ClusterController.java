package com.cnbsoft.mpk3s.cluster;

import com.cnbsoft.mpk3s.multipass.MultipassNode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/clusters")
@RequiredArgsConstructor
public class ClusterController {

    private final ClusterService clusterService;

    @GetMapping
    public List<ClusterResponse> listClusters(@RequestParam(required = false) Long serverId) {
        return clusterService.listClusters(serverId);
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> createCluster(@Valid @RequestBody ClusterRequest req) {
        UUID jobId = clusterService.createCluster(req);
        return ResponseEntity.accepted().body(Map.of("jobId", jobId.toString()));
    }

    @GetMapping("/{name}")
    public ClusterResponse getCluster(@PathVariable String name) {
        return clusterService.getCluster(name);
    }

    @DeleteMapping("/{name}")
    public ResponseEntity<Map<String, String>> deleteCluster(@PathVariable String name) {
        UUID jobId = clusterService.deleteCluster(name);
        return ResponseEntity.accepted().body(Map.of("jobId", jobId.toString()));
    }

    @GetMapping("/{name}/nodes")
    public ResponseEntity<List<MultipassNode>> getNodes(@PathVariable String name) throws Exception {
        return ResponseEntity.ok(clusterService.getNodes(name));
    }

    @PostMapping("/{name}/workers")
    public ResponseEntity<Map<String, String>> addWorkers(
            @PathVariable String name,
            @Valid @RequestBody WorkerRequest req) {
        UUID jobId = clusterService.addWorkers(name, req);
        return ResponseEntity.accepted().body(Map.of("jobId", jobId.toString()));
    }

    @DeleteMapping("/{name}/workers/{workerName}")
    public ResponseEntity<Map<String, String>> deleteWorker(
            @PathVariable String name,
            @PathVariable String workerName) {
        UUID jobId = clusterService.deleteWorker(name, workerName);
        return ResponseEntity.accepted().body(Map.of("jobId", jobId.toString()));
    }

    @PostMapping("/{name}/tls")
    public ResponseEntity<Map<String, String>> addTls(
            @PathVariable String name,
            @RequestBody TlsRequest req) {
        UUID jobId = clusterService.addTls(name, req);
        return ResponseEntity.accepted().body(Map.of("jobId", jobId.toString()));
    }

    @GetMapping("/{name}/kubeconfig")
    public ResponseEntity<byte[]> getKubeconfig(@PathVariable String name) throws Exception {
        String content = clusterService.getKubeconfig(name);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"config-" + name + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(content.getBytes());
    }
}
