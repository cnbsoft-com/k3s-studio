package com.cnbsoft.mpk3s.multipass;

import lombok.extern.slf4j.Slf4j;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;
import java.util.function.Consumer;

@Slf4j
public class SshMultipassExecutor implements MultipassExecutor {

    private final String host;
    private final int port;
    private final String username;
    private final String privateKeyPem;

    public SshMultipassExecutor(String host, int port, String username, String privateKeyPem) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.privateKeyPem = privateKeyPem;
    }

    @Override
    public String execMultipass(String... args) throws IOException, InterruptedException {
        return execRaw("multipass " + String.join(" ", quoteArgs(args)));
    }

    @Override
    public void execMultipassStreaming(Consumer<String> logConsumer, String... args)
            throws IOException, InterruptedException {
        execRawStreaming("multipass " + String.join(" ", quoteArgs(args)), logConsumer);
    }

    @Override
    public String execRaw(String command) throws IOException, InterruptedException {
        log.debug("SSH exec [{}@{}:{}]: {}", username, host, port, command);
        Path tmpKey = writeTempKey();
        try (SSHClient ssh = buildClient(tmpKey)) {
            try (Session session = ssh.startSession()) {
                Session.Command cmd = session.exec(command);
                String stdout = new String(cmd.getInputStream().readAllBytes());
                cmd.join();
                Integer exitCode = cmd.getExitStatus();
                if (exitCode != null && exitCode != 0) {
                    String stderr = new String(cmd.getErrorStream().readAllBytes());
                    throw new IOException("SSH command failed (exit=" + exitCode + "): "
                            + command + "\n" + stderr);
                }
                return stdout.trim();
            }
        } finally {
            Files.deleteIfExists(tmpKey);
        }
    }

    public void execRawStreaming(String command, Consumer<String> logConsumer)
            throws IOException, InterruptedException {
        log.debug("SSH streaming [{}@{}:{}]: {}", username, host, port, command);
        Path tmpKey = writeTempKey();
        try (SSHClient ssh = buildClient(tmpKey)) {
            try (Session session = ssh.startSession()) {
                Session.Command cmd = session.exec(command);
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(cmd.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        logConsumer.accept(line);
                    }
                }
                cmd.join();
                Integer exitCode = cmd.getExitStatus();
                if (exitCode != null && exitCode != 0) {
                    throw new IOException("SSH command failed (exit=" + exitCode + "): " + command);
                }
            }
        } finally {
            Files.deleteIfExists(tmpKey);
        }
    }

    private Path writeTempKey() throws IOException {
        Path tmpKey = Files.createTempFile("mpk3s-key-", null);
        Files.writeString(tmpKey, privateKeyPem);
        try {
            Files.setPosixFilePermissions(tmpKey, Set.of(
                    PosixFilePermission.OWNER_READ,
                    PosixFilePermission.OWNER_WRITE));
        } catch (UnsupportedOperationException ignored) {
            // Windows 환경 무시
        }
        return tmpKey;
    }

    private SSHClient buildClient(Path keyFile) throws IOException {
        SSHClient ssh = new SSHClient();
        ssh.addHostKeyVerifier(new PromiscuousVerifier());
        ssh.connect(host, port);
        ssh.authPublickey(username, keyFile.toString());
        return ssh;
    }

    private String[] quoteArgs(String[] args) {
        String[] quoted = new String[args.length];
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (arg.contains(" ") || arg.contains("'")) {
                quoted[i] = "'" + arg.replace("'", "'\\''") + "'";
            } else {
                quoted[i] = arg;
            }
        }
        return quoted;
    }
}
