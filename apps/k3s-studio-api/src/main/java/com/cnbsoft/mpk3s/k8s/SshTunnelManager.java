package com.cnbsoft.mpk3s.k8s;

import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.LocalPortForwarder;
import net.schmizz.sshj.connection.channel.direct.Parameters;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class SshTunnelManager implements DisposableBean {

    private record TunnelEntry(int localPort, SSHClient ssh, ServerSocket serverSocket) {}

    private final Map<Long, TunnelEntry> tunnels = new ConcurrentHashMap<>();

    public int openTunnel(Long clusterId, String host, int port, String username,
                          String privateKeyPem, String targetHost, int targetPort) throws IOException {
        TunnelEntry existing = tunnels.get(clusterId);
        if (existing != null && existing.ssh().isConnected()) {
            return existing.localPort();
        }
        closeTunnel(clusterId);

        int localPort = findFreePort();
        Path tmpKey = writeTempKey(privateKeyPem);
        try {
            SSHClient ssh = new SSHClient();
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.connect(host, port);
            ssh.authPublickey(username, tmpKey.toString());

            ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress("127.0.0.1", localPort));

            Parameters params =
                    new Parameters("127.0.0.1", localPort, targetHost, targetPort);
            LocalPortForwarder lpf = ssh.newLocalPortForwarder(params, ss);

            Thread.ofVirtual().name("ssh-tunnel-" + clusterId).start(() -> {
                try {
                    lpf.listen();
                } catch (IOException e) {
                    log.debug("SSH tunnel closed for cluster {}", clusterId);
                }
            });

            tunnels.put(clusterId, new TunnelEntry(localPort, ssh, ss));
            log.info("SSH tunnel opened for cluster {} → {}:{} via localhost:{}", clusterId, targetHost, targetPort, localPort);
            return localPort;
        } finally {
            Files.deleteIfExists(tmpKey);
        }
    }

    public void closeTunnel(Long clusterId) {
        TunnelEntry entry = tunnels.remove(clusterId);
        if (entry == null) return;
        try { entry.serverSocket().close(); } catch (IOException ignored) {}
        try { entry.ssh().close(); } catch (IOException ignored) {}
        log.info("SSH tunnel closed for cluster {}", clusterId);
    }

    @Override
    public void destroy() {
        tunnels.keySet().stream().toList().forEach(this::closeTunnel);
    }

    private int findFreePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    private Path writeTempKey(String pem) throws IOException {
        Path tmp = Files.createTempFile("k8s-tunnel-key-", ".pem");
        Files.writeString(tmp, pem);
        Files.setPosixFilePermissions(tmp, Set.of(PosixFilePermission.OWNER_READ));
        return tmp;
    }
}
