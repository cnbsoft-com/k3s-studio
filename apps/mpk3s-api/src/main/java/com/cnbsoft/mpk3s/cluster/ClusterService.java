package com.cnbsoft.mpk3s.cluster;

import com.cnbsoft.mpk3s.job.Job;
import com.cnbsoft.mpk3s.job.JobService;
import com.cnbsoft.mpk3s.job.JobType;
import com.cnbsoft.mpk3s.multipass.MultipassExecutorFactory;
import com.cnbsoft.mpk3s.multipass.MultipassNode;
import com.cnbsoft.mpk3s.multipass.MultipassService;
import com.cnbsoft.mpk3s.server.ServerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
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
                        serverRepository.findById(c.getServerId())
                                .ifPresent(s -> res.setServerName(s.getName()));
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
            serverRepository.findById(cluster.getServerId())
                    .ifPresent(s -> res.setServerName(s.getName()));
        }
        return res;
    }

    public List<MultipassNode> getNodes(String name) throws Exception {
        Cluster cluster = clusterRepository.findByName(name)
                .orElseThrow(() -> new ClusterNotFoundException(name));
        return serviceFor(cluster).listClusterNodes(name);
    }

    @Transactional
    public UUID createCluster(ClusterRequest req) {
        if (clusterRepository.existsByName(req.getName())) {
            throw new IllegalArgumentException("Cluster already exists: " + req.getName());
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
        clusterRepository.save(cluster);

        Job job = jobService.createJob(req.getName(), JobType.CREATE_CLUSTER);
        doCreateCluster(job.getId(), req);
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
                    req.getUbuntuImage(), req.getOptions(),
                    line -> jobService.appendLog(jobId, line));

            String masterIp = svc.getMasterIp(req.getName());
            jobService.appendLog(jobId, "마스터 IP: " + masterIp);

            String nodeToken = svc.getNodeToken(req.getName());

            String[] workerSpec = resolveSpec(req.getWorkerSpec(), req.getWorkerCpus(),
                    req.getWorkerMemory(), req.getWorkerDisk());

            for (int i = 1; i <= req.getWorkerCount(); i++) {
                jobService.appendLog(jobId, "워커 노드 생성 중: " + req.getName() + "-worker" + i);
                svc.launchWorker(req.getName(), i,
                        workerSpec[0], workerSpec[1], workerSpec[2],
                        req.getUbuntuImage(), masterIp, nodeToken,
                        line -> jobService.appendLog(jobId, line));
            }

            String kubeconfig = svc.getKubeconfig(req.getName());
            svc.saveKubeconfig(req.getName(), kubeconfig);
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
        doDeleteCluster(job.getId(), name, cluster.getServerId());
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
        doAddWorkers(job.getId(), clusterName, cluster.getWorkerCount(),
                cluster.getUbuntuImage(), req, cluster.getServerId());
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doAddWorkers(UUID jobId, String clusterName, int currentWorkerCount,
                              String image, WorkerRequest req, Long serverId) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(serverId);
        try {
            String masterIp = svc.getMasterIp(clusterName);
            String nodeToken = svc.getNodeToken(clusterName);
            String[] spec = resolveSpec(req.getWorkerSpec(), req.getWorkerCpus(),
                    req.getWorkerMemory(), req.getWorkerDisk());

            for (int i = 1; i <= req.getWorkerCount(); i++) {
                int idx = currentWorkerCount + i;
                jobService.appendLog(jobId, "워커 노드 생성 중: " + clusterName + "-worker" + idx);
                svc.launchWorker(clusterName, idx,
                        spec[0], spec[1], spec[2], image, masterIp, nodeToken,
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
        doDeleteWorker(job.getId(), clusterName, workerName, cluster.getServerId());
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
        doAddTls(job.getId(), clusterName, req.getDomain(), cluster.getServerId());
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doAddTls(UUID jobId, String clusterName, String domain, Long serverId) {
        jobService.start(jobId);
        MultipassService svc = serviceForServerId(serverId);
        try {
            svc.applyTlsSan(clusterName, domain, line -> jobService.appendLog(jobId, line));
            jobService.complete(jobId);
        } catch (Exception e) {
            log.error("Add TLS failed: {}", clusterName, e);
            jobService.fail(jobId, e.getMessage());
        }
    }

    public String getKubeconfig(String clusterName) throws Exception {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        return serviceFor(cluster).getKubeconfig(clusterName);
    }

    @Transactional
    protected void updateClusterStatus(String name, ClusterStatus status) {
        clusterRepository.findByName(name).ifPresent(c -> {
            c.setStatus(status);
            clusterRepository.save(c);
        });
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
