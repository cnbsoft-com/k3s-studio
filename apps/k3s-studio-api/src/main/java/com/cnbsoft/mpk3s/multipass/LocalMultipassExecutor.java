package com.cnbsoft.mpk3s.multipass;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Consumer;

@Slf4j
@Component
public class LocalMultipassExecutor implements MultipassExecutor {

    @Value("${multipass.command:multipass}")
    private String multipassCmd;

    @Override
    public String execMultipass(String... args) throws IOException, InterruptedException {
        String[] cmd = prepend(multipassCmd, args);
        return exec(cmd);
    }

    @Override
    public void execMultipassStreaming(Consumer<String> logConsumer, String... args)
            throws IOException, InterruptedException {
        String[] cmd = prepend(multipassCmd, args);
        execStreaming(logConsumer, cmd);
    }

    @Override
    public String execRaw(String command) throws IOException, InterruptedException {
        return exec("/bin/sh", "-c", command);
    }

    @Override
    public void uploadFile(String remotePath, String content) throws IOException {
        Files.writeString(Path.of(remotePath), content);
    }

    private String[] prepend(String first, String... rest) {
        String[] cmd = new String[rest.length + 1];
        cmd[0] = first;
        System.arraycopy(rest, 0, cmd, 1, rest.length);
        return cmd;
    }

    private String exec(String... cmd) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process process = pb.start();
        String output = new String(process.getInputStream().readAllBytes());
        int exit = process.waitFor();
        if (exit != 0) {
            throw new IOException("Command failed (exit=" + exit + "): "
                    + String.join(" ", cmd) + "\n" + output);
        }
        return output.trim();
    }

    private void execStreaming(Consumer<String> logConsumer, String... cmd)
            throws IOException, InterruptedException {
        log.debug("Executing: {}", String.join(" ", cmd));
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process process = pb.start();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
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
}
