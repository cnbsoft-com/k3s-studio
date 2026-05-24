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

    @PostMapping("/import")
    public List<ClusterResponse> importClusters(@Valid @RequestBody ImportClustersRequest req) {
        return clusterService.importClusters(req.getServerId(), req.getClusters());
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

    @PostMapping("/{name}/nodes/{nodeName}/start")
    public ResponseEntity<Void> startNode(@PathVariable String name, @PathVariable String nodeName) throws Exception {
        clusterService.startNode(name, nodeName);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/nodes/{nodeName}/stop")
    public ResponseEntity<Void> stopNode(@PathVariable String name, @PathVariable String nodeName) throws Exception {
        clusterService.stopNode(name, nodeName);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/nodes/{nodeName}/restart")
    public ResponseEntity<Void> restartNode(@PathVariable String name, @PathVariable String nodeName) throws Exception {
        clusterService.restartNode(name, nodeName);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/nodes/{nodeName}/suspend")
    public ResponseEntity<Void> suspendNode(@PathVariable String name, @PathVariable String nodeName) throws Exception {
        clusterService.suspendNode(name, nodeName);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{name}/nodes/{nodeName}/hardware")
    public ResponseEntity<Void> setNodeHardware(
            @PathVariable String name,
            @PathVariable String nodeName,
            @RequestBody SetHardwareRequest req) throws Exception {
        clusterService.setNodeHardware(name, nodeName, req);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/start")
    public ResponseEntity<Void> startCluster(@PathVariable String name) throws Exception {
        clusterService.startCluster(name);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/stop")
    public ResponseEntity<Void> stopCluster(@PathVariable String name) throws Exception {
        clusterService.stopCluster(name);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/restart")
    public ResponseEntity<Void> restartCluster(@PathVariable String name) throws Exception {
        clusterService.restartCluster(name);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{name}/suspend")
    public ResponseEntity<Void> suspendCluster(@PathVariable String name) throws Exception {
        clusterService.suspendCluster(name);
        return ResponseEntity.noContent().build();
    }
}
