package com.cnbsoft.mpk3s.multipass;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

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
                             @Nullable String networkInterface,
                             Consumer<String> logConsumer) throws IOException, InterruptedException {
        String remotePath = "/tmp/master-cloud-init-" + UUID.randomUUID() + ".yaml";
        executor.uploadFile(remotePath, buildMasterCloudInit(clusterName, options));
        try {
            List<String> args = new ArrayList<>(Arrays.asList(
                    "launch",
                    "--name", clusterName + "-master",
                    "--cpus", cpus,
                    "--memory", memory,
                    "--disk", disk,
                    "--cloud-init", remotePath,
                    image));
            if (networkInterface != null) {
                args.add("--network");
                args.add(networkInterface);
                try {
                    executor.execMultipassStreaming(logConsumer, args.toArray(String[]::new));
                    return;
                } catch (Exception e) {
                    log.warn("브리지 네트워크 {} 실패, 기본 DHCP로 fallback: {}", networkInterface, e.getMessage());
                    logConsumer.accept("[WARN] 브리지 네트워크 실패, 기본 DHCP로 진행: " + e.getMessage());
                    args.remove("--network");
                    args.remove(networkInterface);
                }
            }
            executor.execMultipassStreaming(logConsumer, args.toArray(String[]::new));
        } finally {
            try { executor.execRaw("rm -f " + remotePath); } catch (Exception ignored) {}
        }
    }

    public void launchWorker(String clusterName, int workerIndex,
                             String cpus, String memory, String disk, String image,
                             String masterIp, String nodeToken,
                             @Nullable String networkInterface,
                             Consumer<String> logConsumer) throws IOException, InterruptedException {
        String remotePath = "/tmp/worker-cloud-init-" + UUID.randomUUID() + ".yaml";
        executor.uploadFile(remotePath, buildWorkerCloudInit(masterIp, nodeToken));
        try {
            List<String> args = new ArrayList<>(Arrays.asList(
                    "launch",
                    "--name", clusterName + "-worker" + workerIndex,
                    "--cpus", cpus,
                    "--memory", memory,
                    "--disk", disk,
                    "--cloud-init", remotePath,
                    image));
            if (networkInterface != null) {
                args.add("--network");
                args.add(networkInterface);
                try {
                    executor.execMultipassStreaming(logConsumer, args.toArray(String[]::new));
                    return;
                } catch (Exception e) {
                    log.warn("워커 브리지 네트워크 {} 실패, 기본 DHCP로 fallback: {}", networkInterface, e.getMessage());
                    logConsumer.accept("[WARN] 워커 브리지 네트워크 실패, 기본 DHCP로 진행: " + e.getMessage());
                    args.remove("--network");
                    args.remove(networkInterface);
                }
            }
            executor.execMultipassStreaming(logConsumer, args.toArray(String[]::new));
        } finally {
            try { executor.execRaw("rm -f " + remotePath); } catch (Exception ignored) {}
        }
    }

    public String getMasterIp(String clusterName) throws IOException, InterruptedException {
        return getMasterIp(clusterName, null);
    }

    public String getMasterIp(String clusterName, @Nullable String bridgeCidr) throws IOException, InterruptedException {
        String nodeName = clusterName + "-master";
        for (int attempt = 0; attempt < 30; attempt++) {
            try {
                MultipassNode master = getNode(nodeName);
                if (bridgeCidr != null && master.getIpv4Addresses() != null) {
                    String matched = findIpInCidr(master.getIpv4Addresses(), bridgeCidr);
                    if (matched != null) return matched;
                }
                String ip = master.getIpv4();
                if (ip != null && !ip.isBlank()) return ip;
            } catch (IOException e) {
                if (e.getMessage() != null && e.getMessage().contains("does not exist")) {
                    throw new IOException(
                            "마스터 노드 '" + nodeName + "' 가 Multipass에 존재하지 않습니다. " +
                            "인스턴스 상태를 확인하거나 클러스터를 재생성하세요.");
                }
                throw e;
            }
            Thread.sleep(2000);
        }
        throw new IOException("마스터 노드 '" + nodeName + "' 의 IP를 60초 내에 가져올 수 없습니다.");
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
        saveKubeconfig(clusterName, kubeconfig, null);
    }

    public void saveKubeconfig(String clusterName, String kubeconfig, @Nullable String bridgeCidr) throws IOException {
        Path kubeconfigPath = Path.of(kubeconfigDir, "config-" + clusterName);
        Files.createDirectories(kubeconfigPath.getParent());
        String masterIp = getMasterIpSafe(clusterName, bridgeCidr);
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
        applyTlsSan(clusterName, domain, null, logConsumer);
    }

    public void applyTlsSan(String clusterName, @Nullable String domain,
                            @Nullable String nodeIp, Consumer<String> logConsumer)
            throws IOException, InterruptedException {
        List<String> tlsSans = new ArrayList<>();
        if (nodeIp != null) tlsSans.add(nodeIp);
        if (domain != null && !domain.isBlank()) tlsSans.add(domain);

        StringBuilder config = new StringBuilder();
        if (nodeIp != null) {
            config.append("node-ip: ").append(nodeIp).append("\n");
        }
        if (!tlsSans.isEmpty()) {
            config.append("tls-san:\n");
            for (String s : tlsSans) {
                config.append("  - ").append(s).append("\n");
            }
        }

        String configContent = config.toString();
        executor.execMultipass("exec", clusterName + "-master", "--", "bash", "-c",
                "echo '" + configContent + "' | sudo tee /etc/rancher/k3s/config.yaml");
        executor.execMultipass("exec", clusterName + "-master", "--",
                "sudo", "systemctl", "restart", "k3s");
        logConsumer.accept("TLS SAN 설정 적용 완료 (domain=" + domain + ", nodeIp=" + nodeIp + ")");
    }

    public void waitForK3sReady(String vmName) throws InterruptedException {
        for (int i = 0; i < 20; i++) {
            try {
                executor.execMultipass("exec", vmName, "--",
                        "sudo", "k3s", "kubectl", "get", "--raw=/readyz");
                return;
            } catch (Exception e) {
                Thread.sleep(3000);
            }
        }
        throw new RuntimeException("k3s did not become ready after applyTlsSan restart (vmName=" + vmName + ")");
    }

    public List<NetworkInterfaceInfo> getNetworkInterfaces() throws IOException, InterruptedException {
        String networksJson = executor.execMultipass("networks", "--format", "json");
        JsonNode root = objectMapper.readTree(networksJson);
        JsonNode list = root.path("list");

        String os;
        try {
            os = executor.execRaw("uname -s").trim();
        } catch (Exception e) {
            os = "Linux";
        }

        List<NetworkInterfaceInfo> result = new ArrayList<>();
        if (list.isArray()) {
            for (JsonNode item : list) {
                String type = item.path("type").asText("");
                if (!"physical".equals(type) && !"bridge".equals(type)) continue;

                String name = item.path("name").asText();
                String cidr = resolveCidr(name, os);
                result.add(new NetworkInterfaceInfo(name, type, cidr));
            }
        }
        return result;
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
        return getMasterIpSafe(clusterName, null);
    }

    private String getMasterIpSafe(String clusterName, @Nullable String bridgeCidr) {
        try {
            return getMasterIp(clusterName, bridgeCidr);
        } catch (Exception e) {
            return "127.0.0.1";
        }
    }

    /**
     * CIDR 표기(예: "192.168.1.0/24")에 속하는 IP를 목록에서 찾아 반환.
     * 매칭 실패 시 null 반환.
     */
    private String findIpInCidr(List<String> addresses, String cidr) {
        if (cidr == null || cidr.isBlank() || addresses == null) return null;
        try {
            String[] parts = cidr.split("/");
            if (parts.length != 2) return null;
            int prefixLen = Integer.parseInt(parts[1].trim());
            byte[] networkBytes = InetAddress.getByName(parts[0].trim()).getAddress();
            int mask = prefixLen == 0 ? 0 : (0xFFFFFFFF << (32 - prefixLen));

            for (String addr : addresses) {
                try {
                    byte[] addrBytes = InetAddress.getByName(addr.trim()).getAddress();
                    if (addrBytes.length != 4) continue;
                    int networkInt = toInt(networkBytes) & mask;
                    int addrInt = toInt(addrBytes) & mask;
                    if (networkInt == addrInt) return addr.trim();
                } catch (UnknownHostException ignored) {}
            }
        } catch (Exception e) {
            log.debug("CIDR 매칭 실패 cidr={}: {}", cidr, e.getMessage());
        }
        return null;
    }

    private int toInt(byte[] bytes) {
        return ((bytes[0] & 0xFF) << 24) | ((bytes[1] & 0xFF) << 16)
             | ((bytes[2] & 0xFF) << 8)  |  (bytes[3] & 0xFF);
    }

    /**
     * 인터페이스 이름으로 CIDR 조회.
     * macOS: ifconfig <iface> → inet <ip> netmask <hex>
     * Linux: ip -o -4 addr show <iface> → inet <ip>/<prefix>
     */
    private String resolveCidr(String iface, String os) {
        try {
            if ("Darwin".equals(os)) {
                String out = executor.execRaw("ifconfig " + iface);
                for (String line : out.split("\n")) {
                    line = line.trim();
                    if (line.startsWith("inet ") && !line.startsWith("inet6")) {
                        String[] tokens = line.split("\\s+");
                        // tokens: [inet, <ip>, netmask, <hex_mask>]
                        if (tokens.length >= 4 && "netmask".equals(tokens[2])) {
                            String ip = tokens[1];
                            String hexMask = tokens[3];
                            int prefix = hexMaskToPrefixLen(hexMask);
                            String network = toNetworkAddress(ip, prefix);
                            return network + "/" + prefix;
                        }
                    }
                }
            } else {
                String out = executor.execRaw("ip -o -4 addr show " + iface);
                for (String line : out.split("\n")) {
                    // tokens: [<idx>, <iface>, inet, <ip>/<prefix>, ...]
                    String[] tokens = line.trim().split("\\s+");
                    for (int i = 0; i < tokens.length - 1; i++) {
                        if ("inet".equals(tokens[i]) && tokens[i + 1].contains("/")) {
                            String[] ipParts = tokens[i + 1].split("/");
                            String ip = ipParts[0];
                            int prefix = Integer.parseInt(ipParts[1]);
                            String network = toNetworkAddress(ip, prefix);
                            return network + "/" + prefix;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("CIDR 조회 실패 iface={}: {}", iface, e.getMessage());
        }
        return null;
    }

    private int hexMaskToPrefixLen(String hex) {
        String clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.substring(2) : hex;
        long mask = Long.parseLong(clean, 16);
        return Integer.bitCount((int) mask);
    }

    private String toNetworkAddress(String ip, int prefix) throws UnknownHostException {
        byte[] addr = InetAddress.getByName(ip).getAddress();
        int mask = prefix == 0 ? 0 : (0xFFFFFFFF << (32 - prefix));
        int network = toInt(addr) & mask;
        return String.format("%d.%d.%d.%d",
                (network >> 24) & 0xFF, (network >> 16) & 0xFF,
                (network >> 8) & 0xFF, network & 0xFF);
    }

    private String buildMasterCloudInit(String clusterName, Map<String, Boolean> options) {
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

        return "#cloud-config\nruncmd:\n  - " + exec + "\n";
    }

    private String buildWorkerCloudInit(String masterIp, String nodeToken) {
        return "#cloud-config\nruncmd:\n  - curl -sfL https://get.k3s.io | "
                + "K3S_URL=https://" + masterIp + ":6443 K3S_TOKEN=" + nodeToken + " sh -\n";
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
                List<String> allIps = StreamSupport.stream(item.path("ipv4").spliterator(), false)
                        .map(JsonNode::asText).collect(Collectors.toList());
                node.setIpv4Addresses(allIps);
                node.setIpv4(allIps.isEmpty() ? null : allIps.get(0));
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
        List<String> allIps = StreamSupport.stream(info.path("ipv4").spliterator(), false)
                .map(JsonNode::asText).collect(Collectors.toList());
        node.setIpv4Addresses(allIps);
        node.setIpv4(allIps.isEmpty() ? null : allIps.get(0));
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
