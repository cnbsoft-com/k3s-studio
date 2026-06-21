package com.cnbsoft.mpk3s.cluster;

import com.cnbsoft.mpk3s.common.AppException;
import com.cnbsoft.mpk3s.job.Job;
import com.cnbsoft.mpk3s.job.JobService;
import com.cnbsoft.mpk3s.job.JobType;
import com.cnbsoft.mpk3s.multipass.MultipassExecutorFactory;
import com.cnbsoft.mpk3s.multipass.MultipassNode;
import com.cnbsoft.mpk3s.multipass.MultipassService;
import com.cnbsoft.mpk3s.multipass.NetworkInterfaceInfo;
import com.cnbsoft.mpk3s.server.ServerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClusterService {

    private final ClusterRepository clusterRepository;
    private final JobService jobService;
    private final MultipassService multipassService;
    private final MultipassExecutorFactory executorFactory;
    private final ServerRepository serverRepository;
    /** 같은 빈 내 @Async 메서드를 프록시 경유로 호출하기 위한 self 참조 (self-invocation 시 @Async 우회 방지) */
    private final ObjectProvider<ClusterService> self;

    @Value("${multipass.kubeconfig-dir:${user.home}/.kube}")
    private String kubeconfigDir;

    public List<ClusterResponse> listClusters(Long serverId) {
        List<Cluster> clusters = (serverId != null)
                ? clusterRepository.findByServerId(serverId)
                : clusterRepository.findAll();
        return clusters.stream()
                .map(c -> {
                    ClusterResponse res = ClusterResponse.from(c);
                    if (c.getServerId() != null) {
                        serverRepository.findById(c.getServerId()).ifPresent(s -> {
                            res.setServerName(s.getName());
                            res.setServerLocal(s.isLocal());
                        });
                    } else {
                        res.setServerLocal(true);
                    }
                    return res;
                })
                .toList();
    }

    public ClusterResponse getCluster(String name) {
        Cluster cluster = clusterRepository.findByName(name)
                .orElseThrow(() -> new ClusterNotFoundException(name));
        ClusterResponse res = ClusterResponse.from(cluster);
        if (cluster.getServerId() != null) {
            serverRepository.findById(cluster.getServerId()).ifPresent(s -> {
                res.setServerName(s.getName());
                res.setServerLocal(s.isLocal());
            });
        } else {
            res.setServerLocal(true);
        }
        return res;
    }

    public List<MultipassNode> getNodes(String name) throws Exception {
        Cluster cluster = clusterRepository.findByName(name)
                .orElseThrow(() -> new ClusterNotFoundException(name));
        return serviceFor(cluster).listClusterNodes(name);
    }

    public List<NetworkInterfaceInfo> getServerNetworks(Long serverId) {
        try {
            return serviceForServerId(serverId).getNetworkInterfaces();
        } catch (Exception e) {
            log.warn("네트워크 인터페이스 조회 실패 (serverId={}): {}", serverId, e.getMessage());
            return List.of();
        }
    }

    @Transactional
    public UUID createCluster(ClusterRequest req) {
        if (clusterRepository.existsByName(req.getName())) {
            throw new AppException("error.cluster_exists", req.getName());
        }

        Cluster cluster = new Cluster();
        cluster.setName(req.getName());
        cluster.setServerId(req.getServerId());
        cluster.setStatus(ClusterStatus.CREATING);
        cluster.setMasterSpec(req.getMasterSpec());
        cluster.setMasterCpus(req.getMasterCpus());
        cluster.setMasterMemory(req.getMasterMemory());
        cluster.setMasterDisk(req.getMasterDisk());
        cluster.setWorkerCount(req.getWorkerCount());
        cluster.setUbuntuImage(req.getUbuntuImage());
        cluster.setOptions(req.getOptions());
        cluster.setNetworkInterface(req.getNetworkInterface());
        cluster.setNetworkInterfaceCidr(req.getNetworkInterfaceCidr());
        clusterRepository.save(cluster);

        Job job = jobService.createJob(req.getName(), JobType.CREATE_CLUSTER);
        self.getObject().doCreateCluster(job.getId(), req);
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doCreateCluster(UUID jobId, ClusterRequest req) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(req.getServerId());
        try {
            String[] masterSpec = resolveSpec(req.getMasterSpec(), req.getMasterCpus(),
                    req.getMasterMemory(), req.getMasterDisk());

            jobService.appendLog(jobId, "마스터 노드 생성 중: " + req.getName() + "-master");
            svc.launchMaster(req.getName(), masterSpec[0], masterSpec[1], masterSpec[2],
                    req.getUbuntuImage(), req.getOptions(), req.getNetworkInterface(),
                    line -> jobService.appendLog(jobId, line));

            String masterIp;
            if (req.getNetworkInterface() != null) {
                // 브리지 모드: CIDR 매칭으로 LAN IP 확정
                String bridgeCidr = req.getNetworkInterfaceCidr();
                masterIp = svc.getMasterIp(req.getName(), bridgeCidr);
                if ("127.0.0.1".equals(masterIp)) {
                    jobService.appendLog(jobId, "[WARN] 브리지 IP를 확정하지 못해 localhost로 kubeconfig가 저장됩니다.");
                }
                jobService.appendLog(jobId, "마스터 IP (브리지): " + masterIp);
                svc.applyTlsSan(req.getName(), null, masterIp, line -> jobService.appendLog(jobId, line));
                svc.waitForK3sReady(req.getName() + "-master");
            } else {
                // 비브리지 모드: 기존 동작 그대로
                masterIp = svc.getMasterIp(req.getName());
                jobService.appendLog(jobId, "마스터 IP: " + masterIp);
            }

            String nodeToken = svc.getNodeToken(req.getName());

            String[] workerSpec = resolveSpec(req.getWorkerSpec(), req.getWorkerCpus(),
                    req.getWorkerMemory(), req.getWorkerDisk());

            for (int i = 1; i <= req.getWorkerCount(); i++) {
                jobService.appendLog(jobId, "워커 노드 생성 중: " + req.getName() + "-worker" + i);
                svc.launchWorker(req.getName(), i,
                        workerSpec[0], workerSpec[1], workerSpec[2],
                        req.getUbuntuImage(), masterIp, nodeToken, req.getNetworkInterface(),
                        line -> jobService.appendLog(jobId, line));
            }

            String kubeconfig = svc.getKubeconfig(req.getName());
            svc.saveKubeconfig(req.getName(), kubeconfig, req.getNetworkInterfaceCidr());
            jobService.appendLog(jobId, "kubeconfig 저장 완료");

            updateClusterStatus(req.getName(), ClusterStatus.RUNNING);
            jobService.complete(jobId);

        } catch (Exception e) {
            log.error("Cluster creation failed: {}", req.getName(), e);
            updateClusterStatus(req.getName(), ClusterStatus.ERROR);
            jobService.fail(jobId, e.getMessage());
        }
    }

    @Transactional
    public UUID deleteCluster(String name) {
        Cluster cluster = clusterRepository.findByName(name)
                .orElseThrow(() -> new ClusterNotFoundException(name));
        cluster.setStatus(ClusterStatus.DELETING);
        clusterRepository.save(cluster);

        Job job = jobService.createJob(name, JobType.DELETE_CLUSTER);
        self.getObject().doDeleteCluster(job.getId(), name, cluster.getServerId());
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doDeleteCluster(UUID jobId, String clusterName, Long serverId) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(serverId);
        try {
            List<MultipassNode> nodes = svc.listClusterNodes(clusterName);
            for (MultipassNode node : nodes) {
                jobService.appendLog(jobId, "노드 삭제 중: " + node.getName());
                svc.deleteNode(node.getName(), line -> jobService.appendLog(jobId, line));
            }
            clusterRepository.findByName(clusterName).ifPresent(clusterRepository::delete);
            jobService.complete(jobId);
        } catch (Exception e) {
            log.error("Cluster deletion failed: {}", clusterName, e);
            updateClusterStatus(clusterName, ClusterStatus.ERROR);
            jobService.fail(jobId, e.getMessage());
        }
    }

    @Transactional
    public UUID addWorkers(String clusterName, WorkerRequest req) {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));

        Job job = jobService.createJob(clusterName, JobType.ADD_WORKER);
        self.getObject().doAddWorkers(job.getId(), clusterName, cluster.getWorkerCount(),
                cluster.getUbuntuImage(), req, cluster.getServerId(),
                cluster.getNetworkInterface(), cluster.getNetworkInterfaceCidr());
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doAddWorkers(UUID jobId, String clusterName, int currentWorkerCount,
                              String image, WorkerRequest req, Long serverId,
                              String networkInterface, String networkInterfaceCidr) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(serverId);
        try {
            String masterIp = svc.getMasterIp(clusterName, networkInterfaceCidr);
            String nodeToken = svc.getNodeToken(clusterName);
            String[] spec = resolveSpec(req.getWorkerSpec(), req.getWorkerCpus(),
                    req.getWorkerMemory(), req.getWorkerDisk());

            for (int i = 1; i <= req.getWorkerCount(); i++) {
                int idx = currentWorkerCount + i;
                jobService.appendLog(jobId, "워커 노드 생성 중: " + clusterName + "-worker" + idx);
                svc.launchWorker(clusterName, idx,
                        spec[0], spec[1], spec[2], image, masterIp, nodeToken, networkInterface,
                        line -> jobService.appendLog(jobId, line));
            }

            clusterRepository.findByName(clusterName).ifPresent(c -> {
                c.setWorkerCount(currentWorkerCount + req.getWorkerCount());
                clusterRepository.save(c);
            });
            jobService.complete(jobId);
        } catch (Exception e) {
            log.error("Add worker failed: {}", clusterName, e);
            jobService.fail(jobId, e.getMessage());
        }
    }

    @Transactional
    public UUID deleteWorker(String clusterName, String workerName) {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        Job job = jobService.createJob(clusterName, JobType.DELETE_WORKER);
        self.getObject().doDeleteWorker(job.getId(), clusterName, workerName, cluster.getServerId());
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doDeleteWorker(UUID jobId, String clusterName, String workerName, Long serverId) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(serverId);
        try {
            jobService.appendLog(jobId, "워커 삭제 중: " + workerName);
            svc.deleteNode(workerName, line -> jobService.appendLog(jobId, line));

            clusterRepository.findByName(clusterName).ifPresent(c -> {
                if (c.getWorkerCount() > 0) c.setWorkerCount(c.getWorkerCount() - 1);
                clusterRepository.save(c);
            });
            jobService.complete(jobId);
        } catch (Exception e) {
            log.error("Delete worker failed: {} {}", clusterName, workerName, e);
            jobService.fail(jobId, e.getMessage());
        }
    }

    @Transactional
    public UUID addTls(String clusterName, TlsRequest req) {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        Job job = jobService.createJob(clusterName, JobType.ADD_TLS);
        self.getObject().doAddTls(job.getId(), clusterName, req.getDomain(), cluster.getServerId());
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doAddTls(UUID jobId, String clusterName, String domain, Long serverId) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(serverId);
        try {
            svc.applyTlsSan(clusterName, domain, null, line -> jobService.appendLog(jobId, line));
            jobService.complete(jobId);
        } catch (Exception e) {
            log.error("Add TLS failed: {}", clusterName, e);
            jobService.fail(jobId, e.getMessage());
        }
    }

    public String getKubeconfig(String clusterName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        MultipassService svc = serviceFor(cluster);
        String raw = svc.getKubeconfig(clusterName);
        return rewriteKubeconfig(raw, clusterName, svc, cluster.getNetworkInterfaceCidr());
    }

    public String helmInstall(String clusterName, String releaseName, String chart, String namespace,
                              String repoName, String repoUrl, String values) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        return serviceFor(cluster).helmInstall(clusterName, releaseName, chart, namespace, repoName, repoUrl, values);
    }

    /**
     * 다운로드용 kubeconfig 변환: 클러스터 정보를 반영한다.
     * - server: https://127.0.0.1 → 마스터 IP (생성 시와 동일하게 networkInterfaceCidr 반영)
     * - default 컨텍스트/클러스터/사용자/current-context 이름 → 클러스터 이름
     * base64 인증 데이터(certificate-authority-data 등)는 YAML 키 패턴으로 앵커링해 손상시키지 않는다.
     */
    private String rewriteKubeconfig(String kubeconfig, String clusterName,
                                     MultipassService svc, String bridgeCidr) {
        String result = kubeconfig;
        try {
            String masterIp = svc.getMasterIp(clusterName, bridgeCidr);
            if (masterIp != null && !masterIp.isBlank()) {
                result = result.replace("127.0.0.1", masterIp);
            }
        } catch (Exception e) {
            log.warn("kubeconfig 마스터 IP 확인 실패, 127.0.0.1 유지: {}", clusterName, e);
        }
        return result.replaceAll(
                "(?m)^(\\s*(?:-\\s+)?(?:name|cluster|user|current-context):\\s*)default\\s*$",
                "$1" + java.util.regex.Matcher.quoteReplacement(clusterName));
    }

    /**
     * 서버의 Multipass에서 *-master 패턴 인스턴스를 찾아 미등록 클러스터 목록 반환.
     * 이미 DB에 등록된 클러스터는 제외.
     */
    public List<DiscoveredCluster> discoverClusters(Long serverId) throws IOException, InterruptedException {
        MultipassService svc = serviceForServerId(serverId);
        List<MultipassNode> nodes = svc.listNodes();

        Set<String> masterNames = new HashSet<>();
        for (MultipassNode n : nodes) {
            if (n.getName().endsWith("-master")) {
                masterNames.add(n.getName().substring(0, n.getName().length() - 7));
            }
        }

        return masterNames.stream()
                .filter(name -> !clusterRepository.existsByName(name))
                .map(name -> {
                    int workers = (int) nodes.stream()
                            .filter(n -> n.getName().matches(name + "-worker\\d+"))
                            .count();
                    String masterIp = nodes.stream()
                            .filter(n -> n.getName().equals(name + "-master"))
                            .findFirst()
                            .map(MultipassNode::getIpv4)
                            .orElse("");
                    return new DiscoveredCluster(name, workers, masterIp);
                })
                .toList();
    }

    /**
     * 선택된 클러스터를 RUNNING 상태로 DB에 등록.
     * 이미 존재하는 이름은 건너뜀.
     */
    @Transactional
    public List<ClusterResponse> importClusters(Long serverId, List<DiscoveredCluster> clusters) {
        return clusters.stream()
                .filter(dc -> !clusterRepository.existsByName(dc.name()))
                .map(dc -> {
                    Cluster c = new Cluster();
                    c.setName(dc.name());
                    c.setServerId(serverId);
                    c.setStatus(ClusterStatus.RUNNING);
                    c.setWorkerCount(dc.workerCount());
                    return ClusterResponse.from(clusterRepository.save(c));
                })
                .toList();
    }

    /**
     * 로컬 서버 최초 등록 시 기존 Multipass 클러스터 자동 import.
     * 실패해도 서버 시작을 막지 않음.
     */
    public void autoImportLocalClusters(Long serverId) {
        try {
            List<DiscoveredCluster> found = discoverClusters(serverId);
            if (!found.isEmpty()) {
                importClusters(serverId, found);
                log.info("로컬 서버 초기화: {}개 클러스터 자동 등록됨", found.size());
            }
        } catch (Exception e) {
            log.warn("로컬 클러스터 자동 감지 실패 (무시): {}", e.getMessage());
        }
    }

    @Transactional
    protected void updateClusterStatus(String name, ClusterStatus status) {
        clusterRepository.findByName(name).ifPresent(c -> {
            c.setStatus(status);
            clusterRepository.save(c);
        });
    }

    // ── Cluster-level async control (AI 도구용) ─────────────────────────────────

    @Async("clusterTaskExecutor")
    public void startClusterAsync(String clusterName) {
        try {
            List<MultipassNode> nodes = getNodes(clusterName);
            for (MultipassNode node : nodes) startNode(clusterName, node.getName());
        } catch (Exception e) {
            log.warn("startClusterAsync 오류 — cluster={}: {}", clusterName, e.getMessage());
        }
    }

    @Async("clusterTaskExecutor")
    public void stopClusterAsync(String clusterName) {
        try {
            List<MultipassNode> nodes = getNodes(clusterName);
            for (MultipassNode node : nodes) stopNode(clusterName, node.getName());
        } catch (Exception e) {
            log.warn("stopClusterAsync 오류 — cluster={}: {}", clusterName, e.getMessage());
        }
    }

    // ── Instance control (synchronous) ────────────────────────────────────────

    public void startNode(String clusterName, String nodeName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).startNode(nodeName);
    }

    public void stopNode(String clusterName, String nodeName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).stopNode(nodeName);
    }

    public void restartNode(String clusterName, String nodeName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).restartNode(nodeName);
    }

    public void suspendNode(String clusterName, String nodeName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).suspendNode(nodeName);
    }

    public void setNodeHardware(String clusterName, String nodeName, SetHardwareRequest req) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        MultipassService svc = serviceFor(cluster);
        MultipassNode node = svc.getNode(nodeName);
        if (!"Stopped".equalsIgnoreCase(node.getState())) {
            throw new AppException("error.node_not_stopped", node.getState());
        }
        svc.setNodeHardware(nodeName, req.cpus(), req.memory(), req.disk());
    }

    public void startCluster(String clusterName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).startCluster(clusterName);
    }

    public void stopCluster(String clusterName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).stopCluster(clusterName);
    }

    public void restartCluster(String clusterName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).restartCluster(clusterName);
    }

    public void suspendCluster(String clusterName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        serviceFor(cluster).suspendCluster(clusterName);
    }

    private MultipassService serviceFor(Cluster cluster) {
        return serviceForServerId(cluster.getServerId());
    }

    private MultipassService serviceForServerId(Long serverId) {
        if (serverId == null) return multipassService;
        return multipassService.withExecutor(executorFactory.get(serverId));
    }

    private String[] resolveSpec(String spec, Integer cpus, String memory, String disk) {
        return switch (spec != null ? spec.toLowerCase() : "") {
            case "small"  -> new String[]{"2", "2G", "10G"};
            case "medium" -> new String[]{"4", "4G", "20G"};
            case "large"  -> new String[]{"8", "8G", "40G"};
            default       -> new String[]{
                    cpus   != null ? cpus.toString() : "2",
                    memory != null ? memory : "2G",
                    disk   != null ? disk   : "10G"
            };
        };
    }
}
