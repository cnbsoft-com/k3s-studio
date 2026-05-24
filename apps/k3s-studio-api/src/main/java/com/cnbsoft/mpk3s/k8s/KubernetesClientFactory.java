package com.cnbsoft.mpk3s.k8s;

import com.cnbsoft.mpk3s.cluster.Cluster;
import com.cnbsoft.mpk3s.config.EncryptionService;
import com.cnbsoft.mpk3s.server.Server;
import com.cnbsoft.mpk3s.server.ServerRepository;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.ConfigBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
@RequiredArgsConstructor
public class KubernetesClientFactory {

    private final ServerRepository serverRepository;
    private final EncryptionService encryptionService;
    private final SshTunnelManager tunnelManager;

    @Value("${multipass.kubeconfig-dir:${user.home}/.kube}")
    private String kubeconfigDir;

    private final Map<Long, KubernetesClient> clientCache = new ConcurrentHashMap<>();

    private static final Pattern SERVER_URL_PATTERN =
            Pattern.compile("server:\\s*(https?://[^\\s]+)", Pattern.MULTILINE);

    public KubernetesClient clientFor(Cluster cluster) throws IOException {
        return clientCache.computeIfAbsent(cluster.getId(), id -> {
            try {
                return buildClient(cluster);
            } catch (IOException e) {
                throw new RuntimeException("Failed to create k8s client for cluster: " + cluster.getName(), e);
            }
        });
    }

    public void evict(Long clusterId) {
        KubernetesClient client = clientCache.remove(clusterId);
        if (client != null) {
            try { client.close(); } catch (Exception ignored) {}
        }
        tunnelManager.closeTunnel(clusterId);
    }

    private KubernetesClient buildClient(Cluster cluster) throws IOException {
        Path kubeconfigPath = Path.of(kubeconfigDir, "config-" + cluster.getName());
        if (!Files.exists(kubeconfigPath)) {
            throw new IOException("kubeconfig not found for cluster: " + cluster.getName()
                    + ". 클러스터 생성 후 kubeconfig가 저장되어 있어야 합니다.");
        }

        String kubeconfigContent = Files.readString(kubeconfigPath);

        if (cluster.getServerId() == null || isLocalServer(cluster.getServerId())) {
            Config config = new ConfigBuilder(Config.fromKubeconfig(kubeconfigContent))
                    .withRequestTimeout(30_000)
                    .build();
            return new KubernetesClientBuilder().withConfig(config).build();
        }

        // 원격 서버: SSH 터널을 열어 VM k8s API로 포워딩
        Server server = serverRepository.findById(cluster.getServerId())
                .orElseThrow(() -> new IOException("Server not found: " + cluster.getServerId()));
        String privateKey = encryptionService.decrypt(server.getPrivateKey());

        String vmIp = extractServerIp(kubeconfigContent);
        int localPort = tunnelManager.openTunnel(
                cluster.getId(), server.getHost(), server.getPort(),
                server.getUsername(), privateKey, vmIp, 6443);

        String patchedKubeconfig = SERVER_URL_PATTERN.matcher(kubeconfigContent)
                .replaceAll("server: https://127.0.0.1:" + localPort);

        Config config = new ConfigBuilder(Config.fromKubeconfig(patchedKubeconfig))
                .withTrustCerts(true)
                .withRequestTimeout(30_000)
                .build();
        return new KubernetesClientBuilder().withConfig(config).build();
    }

    private boolean isLocalServer(Long serverId) {
        return serverRepository.findById(serverId)
                .map(Server::isLocal)
                .orElse(false);
    }

    private String extractServerIp(String kubeconfig) {
        Matcher m = SERVER_URL_PATTERN.matcher(kubeconfig);
        if (!m.find()) throw new IllegalStateException("Cannot parse server URL from kubeconfig");
        String url = m.group(1); // https://192.168.64.5:6443
        return url.replaceAll("https?://", "").replaceAll(":\\d+$", "");
    }
}
