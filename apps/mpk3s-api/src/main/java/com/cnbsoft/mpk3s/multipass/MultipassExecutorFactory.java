package com.cnbsoft.mpk3s.multipass;

import com.cnbsoft.mpk3s.config.EncryptionService;
import com.cnbsoft.mpk3s.server.Server;
import com.cnbsoft.mpk3s.server.ServerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MultipassExecutorFactory {

    private final LocalMultipassExecutor localExecutor;
    private final ServerRepository serverRepository;
    private final EncryptionService encryptionService;

    public MultipassExecutor get(Long serverId) {
        if (serverId == null) return localExecutor;
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalArgumentException("Server not found: " + serverId));
        if (server.isLocal()) return localExecutor;

        String decryptedKey = encryptionService.decrypt(server.getPrivateKey());
        return new SshMultipassExecutor(
                server.getHost(),
                server.getPort(),
                server.getUsername(),
                decryptedKey);
    }
}
