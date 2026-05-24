package com.cnbsoft.mpk3s.multipass;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Stream;

/**
 * Multipass 클러스터 운영 서비스.
 * 내부적으로 MultipassExecutor에 위임하여 로컬/SSH 실행을 추상화한다.
 */
@Slf4j
@Service
public class MultipassService {

    private final MultipassExecutor executor;
    private final String kubeconfigDir;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Spring이 사용하는 기본 생성자 (LocalMultipassExecutor 주입) */
    @Autowired
    public MultipassService(
            LocalMultipassExecutor executor,
            @Value("${multipass.kubeconfig-dir:${user.home}/.kube}") String kubeconfigDir) {
        this.executor = executor;
        this.kubeconfigDir = kubeconfigDir;
    }

    /** 다른 서버용 인스턴스 생성 */
    public MultipassService withExecutor(MultipassExecutor newExecutor) {
        return new MultipassService(newExecutor, this.kubeconfigDir);
    }

    // 패키지 내부 생성자 (withExecutor 용)
    MultipassService(MultipassExecutor executor, String kubeconfigDir) {
        this.executor = executor;
        this.kubeconfigDir = kubeconfigDir;
    }

    public List<MultipassNode> listNodes() throws IOException, InterruptedException {
        String output = executor.execMultipass("ls", "--format", "json");
        return parseNodeList(output);
    }

    public List<MultipassNode> listClusterNodes(String clusterName) throws IOException, InterruptedException {
        return listNodes().stream()
                .filter(n -> n.getName().startsWith(clusterName + "-"))
                .toList();
    }

    public MultipassNode getNode(String nodeName) throws IOException, InterruptedException {
        String output = executor.execMultipass("info", nodeName, "--format", "json");
        return parseNodeInfo(output, nodeName);
    }

    public List<String> listImages() throws IOException, InterruptedException {
        String output = executor.execMultipass("find", "--format", "json");
        return parseImages(output);
    }

    public void launchMaster(String clusterName, String cpus, String memory, String disk,
                             String image, Map<String, Boolean> options,
                             Consumer<String> logConsumer) throws IOException, InterruptedException {
        Path cloudInitFile = createMasterCloudInit(clusterName, options);
        try {
            String nodeName = clusterName + "-master";
            executor.execMultipassStreaming(logConsumer,
                    "launch",
                    "--name", nodeName,
                    "--cpus", cpus,
                    "--memory", memory,
                    "--disk", disk,
                    "--cloud-init", cloudInitFile.toString(),
                    image);
        } finally {
            Files.deleteIfExists(cloudInitFile);
        }
    }

    public void launchWorker(String clusterName, int workerIndex,
                             String cpus, String memory, String disk, String image,
                             String masterIp, String nodeToken,
                             Consumer<String> logConsumer) throws IOException, InterruptedException {
        Path cloudInitFile = createWorkerCloudInit(masterIp, nodeToken);
        try {
            String nodeName = clusterName + "-worker" + workerIndex;
            executor.execMultipassStreaming(logConsumer,
                    "launch",
                    "--name", nodeName,
                    "--cpus", cpus,
                    "--memory", memory,
                    "--disk", disk,
                    "--cloud-init", cloudInitFile.toString(),
                    image);
        } finally {
            Files.deleteIfExists(cloudInitFile);
        }
    }

    public String getMasterIp(String clusterName) throws IOException, InterruptedException {
        try {
            MultipassNode master = getNode(clusterName + "-master");
            return master.getIpv4();
        } catch (IOException e) {
            if (e.getMessage() != null && e.getMessage().contains("does not exist")) {
                throw new IOException(
                        "마스터 노드 '" + clusterName + "-master' 가 Multipass에 존재하지 않습니다. " +
                        "인스턴스 상태를 확인하거나 클러스터를 재생성하세요.");
            }
            throw e;
        }
    }

    public String getNodeToken(String clusterName) throws IOException, InterruptedException {
        try {
            return executor.execMultipass("exec", clusterName + "-master", "--",
                    "sudo", "cat", "/var/lib/rancher/k3s/server/node-token");
        } catch (IOException e) {
            if (e.getMessage() != null && e.getMessage().contains("does not exist")) {
                throw new IOException(
                        "마스터 노드 '" + clusterName + "-master' 가 Multipass에 존재하지 않습니다. " +
                        "인스턴스 상태를 확인하거나 클러스터를 재생성하세요.");
            }
            throw e;
        }
    }

    public String getKubeconfig(String clusterName) throws IOException, InterruptedException {
        return executor.execMultipass("exec", clusterName + "-master", "--",
                "sudo", "cat", "/etc/rancher/k3s/k3s.yaml");
    }

    public void saveKubeconfig(String clusterName, String kubeconfig) throws IOException {
        Path kubeconfigPath = Path.of(kubeconfigDir, "config-" + clusterName);
        Files.createDirectories(kubeconfigPath.getParent());
        String masterIp = getMasterIpSafe(clusterName);
        String content = kubeconfig.replace("127.0.0.1", masterIp);
        Files.writeString(kubeconfigPath, content);
    }

    public void deleteNode(String nodeName, Consumer<String> logConsumer)
            throws IOException, InterruptedException {
        executor.execMultipassStreaming(logConsumer, "delete", nodeName);
        executor.execMultipassStreaming(logConsumer, "purge");
    }

    public void applyTlsSan(String clusterName, String domain, Consumer<String> logConsumer)
            throws IOException, InterruptedException {
        String masterIp = getMasterIp(clusterName);
        String config = buildTlsSanConfig(masterIp, domain);

        executor.execMultipass("exec", clusterName + "-master", "--", "bash", "-c",
                "echo '" + config + "' | sudo tee /etc/rancher/k3s/config.yaml");
        executor.execMultipass("exec", clusterName + "-master", "--",
                "sudo", "systemctl", "restart", "k3s");
        logConsumer.accept("TLS SAN 설정 적용 완료 (domain=" + domain + ", masterIp=" + masterIp + ")");
    }

    // ── node / cluster control ─────────────────────────────────────────────

    public void startNode(String nodeName) throws IOException, InterruptedException {
        executor.execMultipass("start", nodeName);
    }

    public void stopNode(String nodeName) throws IOException, InterruptedException {
        executor.execMultipass("stop", nodeName);
    }

    public void restartNode(String nodeName) throws IOException, InterruptedException {
        executor.execMultipass("restart", nodeName);
    }

    public void suspendNode(String nodeName) throws IOException, InterruptedException {
        executor.execMultipass("suspend", nodeName);
    }

    public void startCluster(String clusterName) throws IOException, InterruptedException {
        List<MultipassNode> nodes = listClusterNodes(clusterName);
        List<String> workers = nodes.stream()
                .filter(n -> !n.getName().equals(clusterName + "-master"))
                .map(MultipassNode::getName)
                .toList();
        executor.execMultipass("start", clusterName + "-master");
        if (!workers.isEmpty()) {
            String[] args = Stream.concat(Stream.of("start"), workers.stream()).toArray(String[]::new);
            executor.execMultipass(args);
        }
    }

    public void stopCluster(String clusterName) throws IOException, InterruptedException {
        List<MultipassNode> nodes = listClusterNodes(clusterName);
        List<String> workers = nodes.stream()
                .filter(n -> !n.getName().equals(clusterName + "-master"))
                .map(MultipassNode::getName)
                .toList();
        if (!workers.isEmpty()) {
            String[] args = Stream.concat(Stream.of("stop"), workers.stream()).toArray(String[]::new);
            executor.execMultipass(args);
        }
        executor.execMultipass("stop", clusterName + "-master");
    }

    public void restartCluster(String clusterName) throws IOException, InterruptedException {
        stopCluster(clusterName);
        startCluster(clusterName);
    }

    public void setNodeHardware(String nodeName, Integer cpus, String memory, String disk)
            throws IOException, InterruptedException {
        if (cpus != null) {
            executor.execMultipass("set", "local." + nodeName + ".cpus=" + cpus);
        }
        if (memory != null && !memory.isBlank()) {
            executor.execMultipass("set", "local." + nodeName + ".memory=" + memory);
        }
        if (disk != null && !disk.isBlank()) {
            executor.execMultipass("set", "local." + nodeName + ".disk=" + disk);
        }
    }

    public void suspendCluster(String clusterName) throws IOException, InterruptedException {
        List<MultipassNode> nodes = listClusterNodes(clusterName);
        String[] nodeNames = nodes.stream().map(MultipassNode::getName).toArray(String[]::new);
        String[] args = Stream.concat(Stream.of("suspend"), Arrays.stream(nodeNames)).toArray(String[]::new);
        executor.execMultipass(args);
    }

    // ── private helpers ────────────────────────────────────────────────────

    private String getMasterIpSafe(String clusterName) {
        try {
            return getMasterIp(clusterName);
        } catch (Exception e) {
            return "127.0.0.1";
        }
    }

    private Path createMasterCloudInit(String clusterName, Map<String, Boolean> options) throws IOException {
        StringBuilder exec = new StringBuilder(
                "curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"--cluster-init");
        if (options != null) {
            if (Boolean.FALSE.equals(options.get("traefik")))      exec.append(" --disable=traefik");
            if (Boolean.FALSE.equals(options.get("flannel")))      exec.append(" --flannel-backend=none --disable-network-policy");
            if (Boolean.FALSE.equals(options.get("servicelb")))    exec.append(" --disable=servicelb");
            if (Boolean.FALSE.equals(options.get("localStorage"))) exec.append(" --disable=local-storage");
            if (Boolean.FALSE.equals(options.get("metricsServer")))exec.append(" --disable=metrics-server");
        }
        exec.append("\" sh -");

        String cloudInit = "#cloud-config\nruncmd:\n  - " + exec + "\n";
        Path tmp = Files.createTempFile("master-cloud-init-", ".yaml");
        Files.writeString(tmp, cloudInit);
        return tmp;
    }

    private Path createWorkerCloudInit(String masterIp, String nodeToken) throws IOException {
        String cloudInit = "#cloud-config\nruncmd:\n  - curl -sfL https://get.k3s.io | "
                + "K3S_URL=https://" + masterIp + ":6443 K3S_TOKEN=" + nodeToken + " sh -\n";
        Path tmp = Files.createTempFile("worker-cloud-init-", ".yaml");
        Files.writeString(tmp, cloudInit);
        return tmp;
    }

    private String buildTlsSanConfig(String masterIp, String domain) {
        StringBuilder sb = new StringBuilder("tls-san:\n  - " + masterIp + "\n");
        if (domain != null && !domain.isBlank()) sb.append("  - ").append(domain).append("\n");
        return sb.toString();
    }

    private List<MultipassNode> parseNodeList(String json) throws IOException {
        JsonNode root = objectMapper.readTree(json);
        List<MultipassNode> nodes = new ArrayList<>();
        JsonNode list = root.get("list");
        if (list != null && list.isArray()) {
            for (JsonNode item : list) {
                MultipassNode node = new MultipassNode();
                node.setName(item.path("name").asText());
                node.setState(item.path("state").asText());
                JsonNode ipv4 = item.path("ipv4");
                if (ipv4.isArray() && !ipv4.isEmpty()) node.setIpv4(ipv4.get(0).asText());
                node.setImage(item.path("release").asText());
                nodes.add(node);
            }
        }
        return nodes;
    }

    private MultipassNode parseNodeInfo(String json, String nodeName) throws IOException {
        JsonNode root = objectMapper.readTree(json);
        JsonNode info = root.path("info").path(nodeName);
        MultipassNode node = new MultipassNode();
        node.setName(nodeName);
        node.setState(info.path("state").asText());
        JsonNode ipv4 = info.path("ipv4");
        if (ipv4.isArray() && !ipv4.isEmpty()) node.setIpv4(ipv4.get(0).asText());
        node.setImage(info.path("image_hash").asText());

        JsonNode cpu = info.path("cpu_count");
        if (!cpu.isMissingNode()) node.setCpus(cpu.asText());
        JsonNode mem = info.path("memory").path("total");
        if (!mem.isMissingNode()) node.setMemory(mem.asText());
        JsonNode disk = info.path("disk").path("sda1").path("total");
        if (!disk.isMissingNode()) node.setDisk(disk.asText());

        return node;
    }

    private List<String> parseImages(String json) throws IOException {
        JsonNode root = objectMapper.readTree(json);
        List<String> images = new ArrayList<>();
        JsonNode imagesNode = root.get("images");
        if (imagesNode != null) {
            imagesNode.fields().forEachRemaining(entry -> {
                String os = entry.getValue().path("os").asText("");
                if ("Ubuntu".equalsIgnoreCase(os)) images.add(entry.getKey());
            });
        }
        return images;
    }
}
