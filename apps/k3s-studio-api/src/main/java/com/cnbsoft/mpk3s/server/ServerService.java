package com.cnbsoft.mpk3s.server;

import com.cnbsoft.mpk3s.common.AppException;
import com.cnbsoft.mpk3s.cluster.ClusterService;
import com.cnbsoft.mpk3s.config.EncryptionService;
import com.cnbsoft.mpk3s.job.Job;
import com.cnbsoft.mpk3s.job.JobService;
import com.cnbsoft.mpk3s.job.JobType;
import com.cnbsoft.mpk3s.multipass.MultipassExecutorFactory;
import com.cnbsoft.mpk3s.multipass.SshMultipassExecutor;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ServerService {

    private final ServerRepository serverRepository;
    private final JobService jobService;
    private final EncryptionService encryptionService;
    private final MultipassExecutorFactory executorFactory;
    private final ClusterService clusterService;
    /** 같은 빈 내 @Async 메서드를 프록시 경유로 호출 (self-invocation 시 @Async 우회 방지) */
    private final ObjectProvider<ServerService> self;

    /** 앱 시작 시 localhost 서버가 없으면 자동 생성. 최초 생성 시 기존 클러스터 자동 감지 */
    @PostConstruct
    @Transactional
    public void initLocalServer() {
        boolean existed = serverRepository.findByLocal(true).isPresent();
        if (!existed) {
            Server local = new Server();
            local.setName("local");
            local.setHost("localhost");
            local.setPort(22);
            local.setUsername("");
            local.setLocal(true);
            local.setStatus(ServerStatus.CONNECTED);
            Server saved = serverRepository.save(local);
            clusterService.autoImportLocalClusters(saved.getId());
        }
    }

    public List<ServerResponse> listServers() {
        return serverRepository.findAll().stream()
                .map(ServerResponse::from)
                .toList();
    }

    public ServerResponse getServer(Long id) {
        return ServerResponse.from(findOrThrow(id));
    }

    @Transactional
    public ServerResponse createServer(ServerRequest req) {
        if (serverRepository.existsByName(req.getName())) {
            throw new AppException("error.server_name_exists", req.getName());
        }
        Server server = new Server();
        server.setName(req.getName());
        server.setHost(req.getHost());
        server.setPort(req.getPort() != null ? req.getPort() : 22);
        server.setUsername(req.getUsername());
        server.setLocal(false);
        server.setStatus(ServerStatus.UNKNOWN);
        if (req.getPrivateKey() != null && !req.getPrivateKey().isBlank()) {
            server.setPrivateKey(encryptionService.encrypt(req.getPrivateKey()));
        }
        return ServerResponse.from(serverRepository.save(server));
    }

    @Transactional
    public ServerResponse updateServer(Long id, ServerRequest req) {
        Server server = findOrThrow(id);
        server.setName(req.getName());
        server.setHost(req.getHost());
        server.setPort(req.getPort() != null ? req.getPort() : 22);
        server.setUsername(req.getUsername());
        if (req.getPrivateKey() != null && !req.getPrivateKey().isBlank()) {
            server.setPrivateKey(encryptionService.encrypt(req.getPrivateKey()));
        }
        return ServerResponse.from(serverRepository.save(server));
    }

    @Transactional
    public void deleteServer(Long id) {
        Server server = findOrThrow(id);
        if (server.isLocal()) throw new AppException("error.local_server_delete");
        serverRepository.delete(server);
    }

    /** SSH 연결 테스트 (즉시 응답) */
    public Map<String, Object> testConnection(Long id) {
        Server server = findOrThrow(id);
        if (server.isLocal()) {
            return Map.of("success", true, "message", "로컬 서버 (연결 불필요)");
        }
        String decryptedKey = encryptionService.decrypt(server.getPrivateKey());
        if (decryptedKey == null) {
            return Map.of("success", false, "message", "SSH Private Key가 등록되지 않았습니다.");
        }
        try {
            SshMultipassExecutor exec = new SshMultipassExecutor(
                    server.getHost(), server.getPort(), server.getUsername(), decryptedKey);
            exec.execRaw("echo ok");
            updateStatus(server, ServerStatus.CONNECTED);
            return Map.of("success", true, "message", "SSH 연결 성공");
        } catch (Exception e) {
            updateStatus(server, ServerStatus.UNREACHABLE);
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return Map.of("success", false, "message", msg);
        }
    }

    /** Multipass 설치 여부 및 버전 확인 */
    public Map<String, Object> checkMultipass(Long id) {
        Server server = findOrThrow(id);
        try {
            String version = executorFactory.get(id).execRaw("multipass version 2>&1 | head -1");
            return Map.of("installed", true, "version", version);
        } catch (Exception e) {
            return Map.of("installed", false, "message", e.getMessage());
        }
    }

    /** Multipass 설치 (비동기 Job) */
    @Transactional
    public UUID installMultipass(Long id) {
        Server server = findOrThrow(id);
        server.setStatus(ServerStatus.INSTALLING_MULTIPASS);
        serverRepository.save(server);

        Job job = jobService.createJob(null, id, JobType.INSTALL_MULTIPASS);
        self.getObject().doInstallMultipass(job.getId(), id);
        return job.getId();
    }

    @Async("clusterTaskExecutor")
    public void doInstallMultipass(UUID jobId, Long serverId) {
        jobService.start(jobId);
        Server server = serverRepository.findById(serverId).orElseThrow();
        try {
            String decryptedKey = encryptionService.decrypt(server.getPrivateKey());
            SshMultipassExecutor exec = new SshMultipassExecutor(
                    server.getHost(), server.getPort(), server.getUsername(), decryptedKey);

            // 1. OS 감지
            jobService.appendLog(jobId, "OS 감지 중...");
            String uname = exec.execRaw("uname -s");
            String osRelease = exec.execRaw("cat /etc/os-release 2>/dev/null || true");
            String osId = parseOsId(osRelease);
            jobService.appendLog(jobId, "OS: " + uname + " / " + osId);

            // 2. 설치 명령 결정
            List<String> cmds = installCommands(uname.trim(), osId);

            // 3. 명령 순차 실행
            for (String cmd : cmds) {
                jobService.appendLog(jobId, "$ " + cmd);
                exec.execRawStreaming(cmd, line -> jobService.appendLog(jobId, line));
            }

            // 4. 설치 확인
            String version = exec.execRaw("multipass version 2>&1 | head -1");
            jobService.appendLog(jobId, "설치 완료: " + version);

            updateStatus(server, ServerStatus.CONNECTED);
            jobService.complete(jobId);
        } catch (Exception e) {
            log.error("Multipass installation failed for server {}", serverId, e);
            updateStatus(server, ServerStatus.UNREACHABLE);
            jobService.fail(jobId, e.getMessage());
        }
    }

    /** 60초마다 모든 서버 연결 상태 점검 */
    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void checkAllServers() {
        serverRepository.findAll().forEach(server -> {
            if (server.getStatus() == ServerStatus.INSTALLING_MULTIPASS) return;
            try {
                if (server.isLocal()) {
                    server.setStatus(ServerStatus.CONNECTED);
                } else {
                    executorFactory.get(server.getId()).execRaw("echo ok");
                    server.setStatus(ServerStatus.CONNECTED);
                }
                server.setLastSeenAt(OffsetDateTime.now());
            } catch (Exception e) {
                log.debug("Server {} unreachable: {}", server.getName(), e.getMessage());
                server.setStatus(ServerStatus.UNREACHABLE);
            }
            serverRepository.save(server);
        });
    }

    // ── private helpers ──────────────────────────────────────────────────

    private Server findOrThrow(Long id) {
        return serverRepository.findById(id)
                .orElseThrow(() -> new ServerNotFoundException(id));
    }

    private void updateStatus(Server server, ServerStatus status) {
        server.setStatus(status);
        if (status == ServerStatus.CONNECTED) server.setLastSeenAt(OffsetDateTime.now());
        serverRepository.save(server);
    }

    private String parseOsId(String osRelease) {
        for (String line : osRelease.split("\n")) {
            if (line.startsWith("ID=")) return line.substring(3).replace("\"", "").trim();
        }
        return "unknown";
    }

    private List<String> installCommands(String uname, String osId) {
        if ("Darwin".equals(uname)) {
            return List.of("brew install multipass");
        }
        return switch (osId.toLowerCase()) {
            case "ubuntu", "debian" -> List.of(
                    "sudo apt-get update -y",
                    "sudo apt-get install -y snapd",
                    "sudo systemctl enable --now snapd",
                    "sudo snap install multipass"
            );
            case "fedora", "rhel", "centos", "rocky", "almalinux" -> List.of(
                    "sudo dnf install -y snapd",
                    "sudo systemctl enable --now snapd",
                    "sudo snap install multipass"
            );
            case "arch" -> List.of("sudo pacman -Sy --noconfirm multipass");
            default -> List.of(
                    "sudo snap install snapd",
                    "sudo systemctl enable --now snapd",
                    "sudo snap install multipass"
            );
        };
    }
}
