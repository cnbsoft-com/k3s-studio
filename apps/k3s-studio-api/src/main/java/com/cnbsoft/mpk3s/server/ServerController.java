package com.cnbsoft.mpk3s.server;

import com.cnbsoft.mpk3s.cluster.ClusterService;
import com.cnbsoft.mpk3s.cluster.DiscoveredCluster;
import com.cnbsoft.mpk3s.multipass.NetworkInterfaceInfo;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/servers")
@RequiredArgsConstructor
public class ServerController {

    private final ServerService serverService;
    private final ClusterService clusterService;

    @GetMapping
    public List<ServerResponse> listServers() {
        return serverService.listServers();
    }

    @PostMapping
    public ResponseEntity<ServerResponse> createServer(@Valid @RequestBody ServerRequest req) {
        return ResponseEntity.ok(serverService.createServer(req));
    }

    @GetMapping("/{id}")
    public ServerResponse getServer(@PathVariable Long id) {
        return serverService.getServer(id);
    }

    @PutMapping("/{id}")
    public ServerResponse updateServer(@PathVariable Long id, @Valid @RequestBody ServerRequest req) {
        return serverService.updateServer(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteServer(@PathVariable Long id) {
        serverService.deleteServer(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/test")
    public Map<String, Object> testConnection(@PathVariable Long id) {
        return serverService.testConnection(id);
    }

    @GetMapping("/{id}/multipass")
    public Map<String, Object> checkMultipass(@PathVariable Long id) {
        return serverService.checkMultipass(id);
    }

    @PostMapping("/{id}/multipass/install")
    public ResponseEntity<Map<String, String>> installMultipass(@PathVariable Long id) {
        UUID jobId = serverService.installMultipass(id);
        return ResponseEntity.accepted().body(Map.of("jobId", jobId.toString()));
    }

    @GetMapping("/{id}/discover-clusters")
    public List<DiscoveredCluster> discoverClusters(@PathVariable Long id) throws Exception {
        return clusterService.discoverClusters(id);
    }

    @GetMapping("/{id}/networks")
    public List<NetworkInterfaceInfo> getNetworks(@PathVariable Long id) {
        return clusterService.getServerNetworks(id);
    }

    @GetMapping("/local/networks")
    public List<NetworkInterfaceInfo> getLocalNetworks() {
        return clusterService.getServerNetworks(null);
    }

    @GetMapping("/{id}/images")
    public List<String> getImages(@PathVariable Long id) {
        return clusterService.getServerImages(id);
    }

    @GetMapping("/local/images")
    public List<String> getLocalImages() {
        return clusterService.getServerImages(null);
    }
}
