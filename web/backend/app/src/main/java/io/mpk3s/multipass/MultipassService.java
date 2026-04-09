package io.mpk3s.multipass;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@Slf4j
@Service
public class MultipassService {

    @Value("${multipass.command:multipass}")
    private String multipassCmd;

    @Value("${multipass.kubeconfig-dir:${user.home}/.kube}")
    private String kubeconfigDir;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public List<MultipassNode> listNodes() throws IOException, InterruptedException {
        String output = exec(multipassCmd, "ls", "--format", "json");
        return parseNodeList(output);
    }

    public List<MultipassNode> listClusterNodes(String clusterName) throws IOException, InterruptedException {
        return listNodes().stream()
                .filter(n -> n.getName().startsWith(clusterName + "-"))
                .toList();
    }

    public MultipassNode getNode(String nodeName) throws IOException, InterruptedException {
        String output = exec(multipassCmd, "info", nodeName, "--format", "json");
        return parseNodeInfo(output, nodeName);
    }

    public List<String> listImages() throws IOException, InterruptedException {
        String output = exec(multipassCmd, "find", "--format", "json");
        return parseImages(output);
    }

    public void launchMaster(String clusterName, String cpus, String memory, String disk,
                             String image, Map<String, Boolean> options,
                             Consumer<String> logConsumer) throws IOException, InterruptedException {
        Path cloudInitFile = createMasterCloudInit(clusterName, options);
        try {
            String nodeName = clusterName + "-master";
            execStreaming(logConsumer,
                    multipassCmd, "launch",
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
            execStreaming(logConsumer,
                    multipassCmd, "launch",
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
        MultipassNode master = getNode(clusterName + "-master");
        return master.getIpv4();
    }

    public String getNodeToken(String clusterName) throws IOException, InterruptedException {
        return execOnNode(clusterName + "-master",
                "sudo", "cat", "/var/lib/rancher/k3s/server/node-token");
    }

    public String getKubeconfig(String clusterName) throws IOException, InterruptedException {
        return execOnNode(clusterName + "-master",
                "sudo", "cat", "/etc/rancher/k3s/k3s.yaml");
    }

    public void saveKubeconfig(String clusterName, String kubeconfig) throws IOException {
        Path kubeconfigPath = Path.of(kubeconfigDir, "config-" + clusterName);
        Files.createDirectories(kubeconfigPath.getParent());
        // master IP로 127.0.0.1 치환
        String content = kubeconfig.replace("127.0.0.1", getMasterIpFromKubeconfig(clusterName));
        Files.writeString(kubeconfigPath, content);
    }

    public void deleteNode(String nodeName, Consumer<String> logConsumer) throws IOException, InterruptedException {
        execStreaming(logConsumer, multipassCmd, "delete", nodeName);
        execStreaming(logConsumer, multipassCmd, "purge");
    }

    public void applyTlsSan(String clusterName, String domain, Consumer<String> logConsumer)
            throws IOException, InterruptedException {
        String masterIp = getMasterIp(clusterName);
        String config = buildTlsSanConfig(masterIp, domain);
        String tmpFile = "/tmp/k3s-tls-" + clusterName + ".yaml";

        execOnNode(clusterName + "-master", "bash", "-c",
                "echo '" + config + "' | sudo tee /etc/rancher/k3s/config.yaml");
        execOnNode(clusterName + "-master", "sudo", "systemctl", "restart", "k3s");
        logConsumer.accept("TLS SAN 설정 적용 완료 (domain=" + domain + ", masterIp=" + masterIp + ")");
    }

    // ── private helpers ────────────────────────────────────────────────────

    private String getMasterIpFromKubeconfig(String clusterName) {
        try {
            return getMasterIp(clusterName);
        } catch (Exception e) {
            return "127.0.0.1";
        }
    }

    private Path createMasterCloudInit(String clusterName, Map<String, Boolean> options) throws IOException {
        StringBuilder exec = new StringBuilder("curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=\"--cluster-init");
        if (options != null) {
            if (Boolean.FALSE.equals(options.get("traefik"))) exec.append(" --disable=traefik");
            if (Boolean.FALSE.equals(options.get("flannel"))) exec.append(" --flannel-backend=none --disable-network-policy");
            if (Boolean.FALSE.equals(options.get("servicelb"))) exec.append(" --disable=servicelb");
            if (Boolean.FALSE.equals(options.get("localStorage"))) exec.append(" --disable=local-storage");
            if (Boolean.FALSE.equals(options.get("metricsServer"))) exec.append(" --disable=metrics-server");
        }
        exec.append("\" sh -");

        String cloudInit = "#cloud-config\n" +
                "runcmd:\n" +
                "  - " + exec + "\n";

        Path tmp = Files.createTempFile("master-cloud-init-", ".yaml");
        Files.writeString(tmp, cloudInit);
        return tmp;
    }

    private Path createWorkerCloudInit(String masterIp, String nodeToken) throws IOException {
        String cloudInit = "#cloud-config\n" +
                "runcmd:\n" +
                "  - curl -sfL https://get.k3s.io | K3S_URL=https://" + masterIp + ":6443 K3S_TOKEN=" + nodeToken + " sh -\n";

        Path tmp = Files.createTempFile("worker-cloud-init-", ".yaml");
        Files.writeString(tmp, cloudInit);
        return tmp;
    }

    private String buildTlsSanConfig(String masterIp, String domain) {
        StringBuilder sb = new StringBuilder("tls-san:\n  - " + masterIp + "\n");
        if (domain != null && !domain.isBlank()) {
            sb.append("  - ").append(domain).append("\n");
        }
        return sb.toString();
    }

    private String execOnNode(String nodeName, String... cmd) throws IOException, InterruptedException {
        List<String> fullCmd = new ArrayList<>();
        fullCmd.add(multipassCmd);
        fullCmd.add("exec");
        fullCmd.add(nodeName);
        fullCmd.add("--");
        fullCmd.addAll(List.of(cmd));
        return exec(fullCmd.toArray(new String[0]));
    }

    private String exec(String... cmd) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process process = pb.start();
        String output = new String(process.getInputStream().readAllBytes());
        int exit = process.waitFor();
        if (exit != 0) {
            throw new IOException("Command failed (exit=" + exit + "): " + String.join(" ", cmd) + "\n" + output);
        }
        return output.trim();
    }

    private void execStreaming(Consumer<String> logConsumer, String... cmd)
            throws IOException, InterruptedException {
        log.debug("Executing: {}", String.join(" ", cmd));
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process process = pb.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                logConsumer.accept(line);
            }
        }

        int exit = process.waitFor();
        if (exit != 0) {
            throw new IOException("Command failed (exit=" + exit + "): " + String.join(" ", cmd));
        }
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
                if (ipv4.isArray() && !ipv4.isEmpty()) {
                    node.setIpv4(ipv4.get(0).asText());
                }
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
        if (ipv4.isArray() && !ipv4.isEmpty()) {
            node.setIpv4(ipv4.get(0).asText());
        }
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
                if ("Ubuntu".equalsIgnoreCase(os)) {
                    images.add(entry.getKey());
                }
            });
        }
        return images;
    }
}
