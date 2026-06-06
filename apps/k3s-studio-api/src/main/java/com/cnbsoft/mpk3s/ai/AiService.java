package com.cnbsoft.mpk3s.ai;

import com.cnbsoft.mpk3s.cluster.ClusterRepository;
import com.cnbsoft.mpk3s.cluster.ClusterRequest;
import com.cnbsoft.mpk3s.cluster.ClusterService;
import com.cnbsoft.mpk3s.k8s.K8sService;
import com.cnbsoft.mpk3s.server.ServerRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiService {

    private static final int MAX_TOOL_ROUNDS = 10;

    private final AiModelConfigRepository configRepository;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final ServerRepository serverRepository;
    private final ClusterRepository clusterRepository;
    private final ClusterService clusterService;
    private final K8sService k8sService;
    private final ObjectMapper objectMapper;

    // conversationId → 승인 대기 중인 매니페스트 작업
    private final ConcurrentHashMap<Long, PendingOperation> pendingOps = new ConcurrentHashMap<>();

    public record PendingOperation(String action, String yaml, String clusterName, Map<String, Object> extra) {}

    @Async("aiTaskExecutor")
    public CompletableFuture<Void> streamChat(Long conversationId, String userMessage, String apiKey, SseEmitter emitter) {
        try {
            AiModelConfig config = configRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new IllegalStateException("AI 모델 설정이 없습니다. /settings/ai 에서 설정해주세요."));

            Conversation conversation = conversationId != null
                    ? conversationRepository.findById(conversationId).orElseGet(() -> conversationRepository.save(new Conversation()))
                    : conversationRepository.save(new Conversation());

            if (conversation.getTitle() == null) {
                conversation.setTitle(userMessage.length() > 25 ? userMessage.substring(0, 25) + "..." : userMessage);
                conversationRepository.save(conversation);
            }

            Message userMsg = new Message();
            userMsg.setConversationId(conversation.getId());
            userMsg.setRole("user");
            userMsg.setContent(userMessage);
            messageRepository.save(userMsg);

            List<Map<String, Object>> messages = buildMessages(conversation.getId(), userMessage);
            RestClient client = buildRestClient(config.getModelUrl(), apiKey);
            List<Map<String, Object>> tools = buildToolDefinitions();

            StringBuilder fullResponse = new StringBuilder();
            int round = 0;

            while (round++ < MAX_TOOL_ROUNDS) {
                StreamResult result = streamModel(client, config.getModelName(), messages, tools, emitter);
                String textContent = result.textContent();
                List<Map<String, Object>> toolCalls = result.toolCalls();

                if (!toolCalls.isEmpty()) {
                    // 어시스턴트 메시지를 히스토리에 추가 (tool_calls 포함)
                    Map<String, Object> assistantEntry = new HashMap<>();
                    assistantEntry.put("role", "assistant");
                    if (!textContent.isBlank()) assistantEntry.put("content", textContent);
                    assistantEntry.put("tool_calls", toolCalls);
                    messages.add(assistantEntry);

                    for (Map<String, Object> toolCall : toolCalls) {
                        String toolCallId = (String) toolCall.getOrDefault("id", "");
                        @SuppressWarnings("unchecked")
                        Map<String, Object> fn = (Map<String, Object>) toolCall.getOrDefault("function", Map.of());
                        String toolName = (String) fn.getOrDefault("name", "");
                        String argsJson = (String) fn.getOrDefault("arguments", "{}");
                        Map<String, Object> args = objectMapper.readValue(argsJson, new TypeReference<>() {});

                        // 파괴적 도구: 즉시 실행하지 않고 preview 이벤트로 사용자 확인 요청
                        if ("apply_manifest".equals(toolName) || "delete_manifest".equals(toolName)) {
                            String yaml = (String) args.getOrDefault("yaml", "");
                            String cluster = (String) args.getOrDefault("clusterName", "");
                            if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, yaml, cluster, Map.of())) == null) {
                                String previewPayload = objectMapper.writeValueAsString(
                                        Map.of("action", toolName, "yaml", yaml, "clusterName", cluster));
                                emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                            }
                            break;
                        }
                        if ("scale_deployment".equals(toolName) || "restart_deployment".equals(toolName)) {
                            String cluster = requireString(args, "clusterName");
                            String ns = (String) args.getOrDefault("namespace", "default");
                            String depName = requireString(args, "deploymentName");
                            Map<String, Object> extra = new java.util.HashMap<>(Map.of("namespace", ns, "name", depName));
                            String displayYaml;
                            if ("scale_deployment".equals(toolName)) {
                                int replicas = ((Number) args.getOrDefault("replicas", 1)).intValue();
                                extra.put("replicas", replicas);
                                displayYaml = "deployment: " + depName + "\nnamespace: " + ns + "\nreplicas: " + replicas;
                            } else {
                                displayYaml = "deployment: " + depName + "\nnamespace: " + ns;
                            }
                            if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, displayYaml, cluster, extra)) == null) {
                                String previewPayload = objectMapper.writeValueAsString(
                                        Map.of("action", toolName, "yaml", displayYaml, "clusterName", cluster));
                                emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                            }
                            break;
                        }
                        if ("start_cluster".equals(toolName) || "stop_cluster".equals(toolName) || "create_cluster".equals(toolName)) {
                            String cluster = requireString(args, "clusterName");
                            Map<String, Object> extra = buildClusterLifecycleExtra(toolName, args);
                            String displayYaml = buildClusterLifecycleDisplay(toolName, args);
                            if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, displayYaml, cluster, extra)) == null) {
                                String previewPayload = objectMapper.writeValueAsString(
                                        Map.of("action", toolName, "yaml", displayYaml, "clusterName", cluster));
                                emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                            }
                            break;
                        }

                        emitter.send(SseEmitter.event().name("tool").data("⚙ " + toolName + " 실행 중..."));
                        String toolResult;
                        try {
                            toolResult = executeTool(toolName, args);
                        } catch (Exception e) {
                            toolResult = "오류: " + e.getMessage();
                        }
                        messages.add(Map.of("role", "tool", "tool_call_id", toolCallId, "content", toolResult));
                    }

                    // preview 이벤트를 보냈으면 루프 종료
                    if (pendingOps.containsKey(conversation.getId())) {
                        break;
                    }
                    continue;
                }

                // Fallback: JSON content에 tool call (비표준 모델 지원)
                if (!textContent.isBlank()) {
                    try {
                        JsonNode parsed = objectMapper.readTree(textContent.trim());
                        if (parsed.isObject() && parsed.has("name") && parsed.has("arguments")) {
                            String toolName = parsed.path("name").asText();
                            Map<String, Object> args = objectMapper.convertValue(parsed.path("arguments"), new TypeReference<>() {});

                            if ("apply_manifest".equals(toolName) || "delete_manifest".equals(toolName)) {
                                String yaml = (String) args.getOrDefault("yaml", "");
                                String cluster = (String) args.getOrDefault("clusterName", "");
                                if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, yaml, cluster, Map.of())) == null) {
                                    String previewPayload = objectMapper.writeValueAsString(
                                            Map.of("action", toolName, "yaml", yaml, "clusterName", cluster));
                                    emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                                }
                                break;
                            }
                            if ("scale_deployment".equals(toolName) || "restart_deployment".equals(toolName)) {
                                String cluster = requireString(args, "clusterName");
                                String ns = (String) args.getOrDefault("namespace", "default");
                                String depName = requireString(args, "deploymentName");
                                Map<String, Object> extra = new java.util.HashMap<>(Map.of("namespace", ns, "name", depName));
                                String displayYaml;
                                if ("scale_deployment".equals(toolName)) {
                                    int replicas = ((Number) args.getOrDefault("replicas", 1)).intValue();
                                    extra.put("replicas", replicas);
                                    displayYaml = "deployment: " + depName + "\nnamespace: " + ns + "\nreplicas: " + replicas;
                                } else {
                                    displayYaml = "deployment: " + depName + "\nnamespace: " + ns;
                                }
                                if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, displayYaml, cluster, extra)) == null) {
                                    String previewPayload = objectMapper.writeValueAsString(
                                            Map.of("action", toolName, "yaml", displayYaml, "clusterName", cluster));
                                    emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                                }
                                break;
                            }
                            if ("start_cluster".equals(toolName) || "stop_cluster".equals(toolName) || "create_cluster".equals(toolName)) {
                                String cluster = requireString(args, "clusterName");
                                Map<String, Object> extra = buildClusterLifecycleExtra(toolName, args);
                                String displayYaml = buildClusterLifecycleDisplay(toolName, args);
                                if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, displayYaml, cluster, extra)) == null) {
                                    String previewPayload = objectMapper.writeValueAsString(
                                            Map.of("action", toolName, "yaml", displayYaml, "clusterName", cluster));
                                    emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                                }
                                break;
                            }

                            emitter.send(SseEmitter.event().name("tool").data("⚙ " + toolName + " 실행 중..."));
                            String toolResult;
                            try {
                                toolResult = executeTool(toolName, args);
                            } catch (Exception e) {
                                toolResult = "오류: " + e.getMessage();
                            }
                            messages.add(Map.of("role", "assistant", "content", textContent));
                            messages.add(Map.of("role", "user", "content", "도구 실행 결과:\n" + toolResult));
                            continue;
                        }
                    } catch (Exception ignored) {}
                }

                // tool call이 없는 순수 텍스트 응답: SSE로 전송
                if (!textContent.isBlank()) {
                    emitter.send(SseEmitter.event().data(textContent));
                }
                fullResponse.append(textContent);
                break;
            }

            if (round >= MAX_TOOL_ROUNDS) {
                String limitMsg = "\n[도구 호출 횟수 한도(10회) 초과]";
                emitter.send(SseEmitter.event().data(limitMsg));
                fullResponse.append(limitMsg);
            }

            if (!fullResponse.isEmpty()) {
                Message assistantReply = new Message();
                assistantReply.setConversationId(conversation.getId());
                assistantReply.setRole("assistant");
                assistantReply.setContent(fullResponse.toString());
                messageRepository.save(assistantReply);
            }

            emitter.send(SseEmitter.event().name("done").data(conversation.getId().toString()));
            emitter.complete();
        } catch (Exception e) {
            log.error("AI chat error", e);
            try {
                emitter.send(SseEmitter.event().name("error").data(friendlyAiError(e)));
                emitter.complete();
            } catch (IOException ignored) {}
        }
        return CompletableFuture.completedFuture(null);
    }

    public String confirmPending(Long conversationId) throws Exception {
        PendingOperation op = pendingOps.remove(conversationId);
        if (op == null) throw new IllegalStateException("대기 중인 작업이 없습니다.");

        return switch (op.action()) {
            case "apply_manifest" -> {
                k8sService.applyManifest(op.clusterName(), op.yaml());
                saveManifestMessage(conversationId, op.action(), op.yaml(), "매니페스트 적용 완료");
                yield "매니페스트 적용 완료";
            }
            case "delete_manifest" -> {
                k8sService.deleteManifest(op.clusterName(), op.yaml());
                saveManifestMessage(conversationId, op.action(), op.yaml(), "매니페스트 삭제 완료");
                yield "매니페스트 삭제 완료";
            }
            case "scale_deployment" -> {
                String ns = (String) op.extra().get("namespace");
                String name = (String) op.extra().get("name");
                int replicas = ((Number) op.extra().get("replicas")).intValue();
                k8sService.scaleDeployment(op.clusterName(), ns, name, replicas);
                String result = name + " 디플로이먼트가 " + replicas + "개로 스케일되었습니다.";
                saveManifestMessage(conversationId, op.action(), op.yaml(), result);
                yield result;
            }
            case "restart_deployment" -> {
                String ns = (String) op.extra().get("namespace");
                String name = (String) op.extra().get("name");
                k8sService.restartDeployment(op.clusterName(), ns, name);
                String result = name + " 디플로이먼트가 재시작되었습니다.";
                saveManifestMessage(conversationId, op.action(), op.yaml(), result);
                yield result;
            }
            case "start_cluster" -> {
                clusterService.startClusterAsync(op.clusterName());
                String result = "클러스터 '" + op.clusterName() + "' 시작을 요청했습니다. list_clusters로 상태를 확인하세요.";
                saveManifestMessage(conversationId, op.action(), op.yaml(), result);
                yield result;
            }
            case "stop_cluster" -> {
                clusterService.stopClusterAsync(op.clusterName());
                String result = "클러스터 '" + op.clusterName() + "' 정지를 요청했습니다. list_clusters로 상태를 확인하세요.";
                saveManifestMessage(conversationId, op.action(), op.yaml(), result);
                yield result;
            }
            case "create_cluster" -> {
                int workers = ((Number) op.extra().getOrDefault("workers", 0)).intValue();
                int cpu = ((Number) op.extra().getOrDefault("cpu", 2)).intValue();
                int memory = ((Number) op.extra().getOrDefault("memory", 2048)).intValue();
                int disk = ((Number) op.extra().getOrDefault("disk", 20)).intValue();
                // 대상 서버 해석: serverName 지정 시 해당 서버, 미지정 시 로컬(null)
                Long serverId = null;
                Object serverNameObj = op.extra().get("serverName");
                if (serverNameObj != null && !serverNameObj.toString().isBlank()) {
                    String serverName = serverNameObj.toString().trim();
                    var target = serverRepository.findByName(serverName)
                            .orElseThrow(() -> new IllegalStateException(
                                    "서버 '" + serverName + "'를 찾을 수 없습니다. list_servers로 등록된 서버를 확인하세요."));
                    serverId = target.isLocal() ? null : target.getId();
                }
                ClusterRequest req = new ClusterRequest();
                req.setName(op.clusterName());
                req.setServerId(serverId);
                req.setWorkerCount(workers);
                req.setMasterSpec("custom");
                req.setMasterCpus(cpu);
                req.setMasterMemory(memory + "MB");
                req.setMasterDisk(disk + "G");
                req.setWorkerSpec("custom");
                req.setWorkerCpus(cpu);
                req.setWorkerMemory(memory + "MB");
                req.setWorkerDisk(disk + "G");
                req.setUbuntuImage("22.04");
                java.util.UUID jobId = clusterService.createCluster(req);
                String result = "클러스터 '" + op.clusterName() + "' 생성 시작 (job: " + jobId + "). list_clusters로 상태를 확인하세요.";
                saveManifestMessage(conversationId, op.action(), op.yaml(), result);
                yield result;
            }
            default -> throw new IllegalStateException("알 수 없는 액션: " + op.action());
        };
    }

    public void cancelPending(Long conversationId) {
        pendingOps.remove(conversationId);
    }

    private void saveManifestMessage(Long conversationId, String action, String yaml, String result) {
        Message msg = new Message();
        msg.setConversationId(conversationId);
        msg.setRole("assistant");
        msg.setContent("```yaml\n" + yaml + "\n```\n" + result);
        messageRepository.save(msg);
    }

    private List<Map<String, Object>> buildMessages(Long conversationId, String currentUserMessage) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", buildSystemPrompt()));

        List<Message> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        for (int i = 0; i < history.size() - 1; i++) {
            Message m = history.get(i);
            messages.add(Map.of("role", m.getRole(), "content", m.getContent()));
        }

        messages.add(Map.of("role", "user", "content", currentUserMessage));
        return messages;
    }

    private String buildSystemPrompt() {
        long serverCount = serverRepository.count();
        long clusterCount = clusterRepository.count();
        return """
                당신은 k3s-studio AI 어시스턴트입니다. 사용자의 k3s 클러스터와 서버를 자연어 명령으로 관리합니다.
                현재 등록된 서버: %d개, 클러스터: %d개.

                도구를 사용할 때는 반드시 올바른 파라미터를 전달하세요.
                알 수 없는 클러스터나 서버가 언급되면 먼저 목록을 조회하세요.
                목록 조회 결과는 마크다운 테이블 형식으로 응답하세요.

                리소스 생성/삭제 요청 시 규칙:
                - YAML을 텍스트로 출력하지 마세요. 반드시 apply_manifest 또는 delete_manifest 도구를 호출하세요.
                - 사용자가 생성/배포/삭제를 요청하면 즉시 해당 도구를 호출하세요. 먼저 YAML을 보여주거나 확인을 묻지 마세요.
                - apply_manifest, create_cluster, start_cluster, stop_cluster 등은 서버가 사용자에게 자동으로 미리보기를 보여주고 확인을 요청합니다.

                클러스터 생성(create_cluster) 시 서버 지정 규칙:
                - 사용자가 특정 서버를 언급하면 serverName 파라미터에 그 서버 이름을 정확히 전달하세요. 예: "mac-mini 서버에 클러스터 생성" → serverName="mac-mini".
                - 서버를 언급하지 않으면 serverName을 비워두세요 (로컬 서버에 생성됨).
                - 사용자가 언급한 서버 이름이 등록돼 있는지 확실하지 않으면 먼저 list_servers로 확인하세요.

                NodePort 서비스를 생성(apply_manifest)하여 사용자가 confirm한 후에는 반드시:
                1. list_services를 호출하여 할당된 nodePort를 확인하세요.
                2. list_nodes를 호출하여 노드의 InternalIP를 확인하세요.
                3. 접근 가능한 URL http://{InternalIP}:{nodePort}를 사용자에게 알려주세요.

                응답은 한국어로 합니다.
                """.formatted(serverCount, clusterCount);
    }

    private record StreamResult(String textContent, List<Map<String, Object>> toolCalls, String finishReason) {}

    private RestClient buildRestClient(String modelUrl, String apiKey) {
        // 스트리밍 응답이므로 per-read SO_TIMEOUT을 적용하는 SimpleClientHttpRequestFactory 사용.
        // 모델이 토큰을 전혀 내지 않고 멈추면 readTimeout 후 SocketTimeoutException으로 깔끔히 실패.
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(180_000);
        return RestClient.builder()
                .requestFactory(factory)
                .baseUrl(modelUrl)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + (apiKey != null ? apiKey : "ollama"))
                .build();
    }

    /** Ollama/모델 호출 예외를 사용자 친화적 한국어 메시지로 변환 */
    private String friendlyAiError(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String rm = root.getMessage() == null ? "" : root.getMessage();
        if (root instanceof java.net.SocketTimeoutException || rm.contains("timed out") || rm.contains("Read timed out")) {
            return "AI 모델 응답 시간 초과입니다. 모델 서버가 느리거나 응답하지 않습니다. 잠시 후 다시 시도하거나 더 작은 모델로 변경하세요.";
        }
        if (root instanceof java.net.ConnectException || rm.contains("Connection refused") || rm.contains("Connection timed out")) {
            return "AI 모델 서버에 연결할 수 없습니다. 모델 서버 주소와 실행 상태를 확인하세요.";
        }
        return "AI 처리 오류: " + (rm.isBlank() ? e.getMessage() : rm);
    }

    private StreamResult streamModel(RestClient client, String modelName,
                                     List<Map<String, Object>> messages, List<Map<String, Object>> tools,
                                     SseEmitter emitter) throws Exception {
        Map<String, Object> body = Map.of(
                "model", modelName,
                "messages", messages,
                "tools", tools,
                "stream", true
        );

        StringBuilder textBuffer = new StringBuilder();
        Map<Integer, Map<String, Object>> toolCallBuffers = new HashMap<>();
        String[] finishReason = {null};

        client.post()
                .uri("/v1/chat/completions")
                .body(body)
                .exchange((req, res) -> {
                    try (InputStream is = res.getBody();
                         BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (!line.startsWith("data:")) continue;
                            String data = line.substring(5).trim();
                            if ("[DONE]".equals(data)) break;

                            JsonNode chunk = objectMapper.readTree(data);
                            JsonNode delta = chunk.path("choices").path(0).path("delta");
                            String reason = chunk.path("choices").path(0).path("finish_reason").asText(null);
                            if (reason != null && !reason.isBlank() && !"null".equals(reason)) finishReason[0] = reason;

                            // 텍스트 청크: 버퍼링만 (tool call 여부 확인 후 caller에서 전송)
                            String content = delta.path("content").asText(null);
                            if (content != null && !content.isEmpty()) {
                                textBuffer.append(content);
                            }

                            // tool_calls 청크: 인덱스별 누적
                            if (delta.has("tool_calls")) {
                                for (JsonNode tc : delta.path("tool_calls")) {
                                    int idx = tc.path("index").asInt(0);
                                    Map<String, Object> buf = toolCallBuffers.computeIfAbsent(idx, k -> new HashMap<>());
                                    if (tc.has("id")) buf.put("id", tc.path("id").asText());
                                    if (tc.has("type")) buf.put("type", tc.path("type").asText());
                                    Map<String, Object> fn = (Map<String, Object>) buf.computeIfAbsent("function", k -> new HashMap<>());
                                    JsonNode fnNode = tc.path("function");
                                    if (fnNode.has("name")) fn.put("name", fnNode.path("name").asText());
                                    if (fnNode.has("arguments")) {
                                        fn.merge("arguments", fnNode.path("arguments").asText(), (a, b) -> a.toString() + b.toString());
                                    }
                                }
                            }
                        }
                    }
                    return null;
                });

        List<Map<String, Object>> toolCalls = toolCallBuffers.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(Map.Entry::getValue)
                .toList();

        return new StreamResult(textBuffer.toString(), toolCalls, finishReason[0] != null ? finishReason[0] : "stop");
    }

    private String executeTool(String name, Map<String, Object> args) throws Exception {
        return switch (name) {
            case "list_servers" -> {
                var servers = serverRepository.findAll();
                yield objectMapper.writeValueAsString(servers.stream()
                        .map(s -> Map.of("id", s.getId(), "name", s.getName(), "host", s.getHost(), "status", s.getStatus().name()))
                        .toList());
            }
            case "list_clusters" -> {
                var clusters = clusterRepository.findAll();
                yield objectMapper.writeValueAsString(clusters.stream()
                        .map(c -> Map.of("id", c.getId(), "name", c.getName(), "status", c.getStatus().name()))
                        .toList());
            }
            case "list_namespaces" -> {
                String cluster = requireString(args, "clusterName");
                yield objectMapper.writeValueAsString(k8sService.getNamespaces(cluster));
            }
            case "list_pods" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                yield objectMapper.writeValueAsString(k8sService.getPods(cluster, ns));
            }
            case "list_services" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                yield objectMapper.writeValueAsString(k8sService.getServices(cluster, ns));
            }
            case "list_deployments" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                yield objectMapper.writeValueAsString(k8sService.getDeployments(cluster, ns));
            }
            case "list_statefulsets" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                yield objectMapper.writeValueAsString(k8sService.getStatefulSets(cluster, ns));
            }
            case "get_resource_manifest" -> {
                String cluster = requireString(args, "clusterName");
                String type = requireString(args, "resourceType");
                String ns = (String) args.getOrDefault("namespace", "default");
                String resName = requireString(args, "resourceName");
                yield k8sService.getResourceManifest(cluster, type, ns, resName);
            }
            case "list_nodes" -> {
                String cluster = requireString(args, "clusterName");
                yield objectMapper.writeValueAsString(k8sService.getNodes(cluster));
            }
            case "get_pod_logs" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                String pod = requireString(args, "podName");
                int tail = Math.min(((Number) args.getOrDefault("tail", 50)).intValue(), 200);
                yield k8sService.getPodLogs(cluster, ns, pod, tail);
            }
            case "list_configmaps" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                yield objectMapper.writeValueAsString(k8sService.getConfigMaps(cluster, ns));
            }
            case "list_ingresses" -> {
                String cluster = requireString(args, "clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                yield objectMapper.writeValueAsString(k8sService.getIngresses(cluster, ns));
            }
            default -> "알 수 없는 도구: " + name;
        };
    }

    private String requireString(Map<String, Object> args, String key) {
        Object val = args.get(key);
        if (val == null) throw new IllegalArgumentException("필수 파라미터 누락: " + key);
        return val.toString();
    }

    private List<Map<String, Object>> buildToolDefinitions() {
        return List.of(
                tool("list_servers", "등록된 서버 목록 조회", Map.of("type", "object", "properties", Map.of())),
                tool("list_clusters", "등록된 k3s 클러스터 목록 조회", Map.of("type", "object", "properties", Map.of())),
                tool("list_namespaces", "클러스터의 네임스페이스 목록 조회",
                        param("clusterName", "클러스터 이름")),
                tool("list_pods", "파드 목록 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)")
                        ), "required", List.of("clusterName"))),
                tool("list_services", "서비스 목록 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)")
                        ), "required", List.of("clusterName"))),
                tool("list_deployments", "디플로이먼트 목록 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)")
                        ), "required", List.of("clusterName"))),
                tool("list_statefulsets", "스테이트풀셋 목록 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)")
                        ), "required", List.of("clusterName"))),
                tool("get_resource_manifest", "특정 리소스의 현재 YAML 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "resourceType", strProp("리소스 타입 (예: deployment, service, pod)"),
                                "namespace", strProp("네임스페이스"),
                                "resourceName", strProp("리소스 이름")
                        ), "required", List.of("clusterName", "resourceType", "namespace", "resourceName"))),
                tool("list_nodes", "클러스터 노드 목록 및 IP 주소 조회 (NodePort 서비스 접근 URL 확인에 사용)",
                        param("clusterName", "클러스터 이름")),
                tool("get_pod_logs", "파드 로그 조회 (최대 200줄)",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스"),
                                "podName", strProp("파드 이름"),
                                "tail", Map.of("type", "integer", "description", "조회할 줄 수 (기본 50, 최대 200)")
                        ), "required", List.of("clusterName", "namespace", "podName"))),
                tool("start_cluster", "k3s 클러스터 전체 시작 (사용자 확인 후 실행됨)",
                        param("clusterName", "시작할 클러스터 이름")),
                tool("stop_cluster", "k3s 클러스터 전체 정지 (사용자 확인 후 실행됨)",
                        param("clusterName", "정지할 클러스터 이름")),
                tool("create_cluster", "새 k3s 클러스터 생성 (사용자 확인 후 실행됨, 기본값: workers=0 cpu=2 memory=2048MB disk=20GB). serverName 미지정 시 로컬 서버에 생성됨",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("생성할 클러스터 이름"),
                                "serverName", strProp("생성 대상 서버 이름 (예: local, mac-mini). 미지정 시 로컬 서버"),
                                "workers", Map.of("type", "integer", "description", "워커 수 (기본값 0)"),
                                "cpu", Map.of("type", "integer", "description", "마스터 CPU 수 (기본값 2)"),
                                "memory", Map.of("type", "integer", "description", "마스터 메모리 MB (기본값 2048)"),
                                "disk", Map.of("type", "integer", "description", "마스터 디스크 GB (기본값 20)")
                        ), "required", List.of("clusterName"))),
                tool("list_configmaps", "컨피그맵 목록 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)")
                        ), "required", List.of("clusterName"))),
                tool("list_ingresses", "인그레스 목록 조회",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)")
                        ), "required", List.of("clusterName"))),
                tool("scale_deployment", "디플로이먼트 레플리카 수 조정 (사용자 확인 후 실행됨)",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)"),
                                "deploymentName", strProp("디플로이먼트 이름"),
                                "replicas", Map.of("type", "integer", "description", "목표 레플리카 수")
                        ), "required", List.of("clusterName", "deploymentName", "replicas"))),
                tool("restart_deployment", "디플로이먼트 롤링 재시작 (사용자 확인 후 실행됨)",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스 (기본값: default)"),
                                "deploymentName", strProp("디플로이먼트 이름")
                        ), "required", List.of("clusterName", "deploymentName"))),
                tool("apply_manifest", "YAML 매니페스트 적용 (사용자 확인 후 실행됨)",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "yaml", strProp("적용할 YAML 내용")
                        ), "required", List.of("clusterName", "yaml"))),
                tool("delete_manifest", "YAML 매니페스트 삭제 (사용자 확인 후 실행됨)",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "yaml", strProp("삭제할 YAML 내용")
                        ), "required", List.of("clusterName", "yaml")))
        );
    }

    private Map<String, Object> tool(String name, String description, Map<String, Object> parameters) {
        return Map.of(
                "type", "function",
                "function", Map.of("name", name, "description", description, "parameters", parameters)
        );
    }

    private Map<String, Object> param(String paramName, String description) {
        return Map.of("type", "object",
                "properties", Map.of(paramName, strProp(description)),
                "required", List.of(paramName));
    }

    private Map<String, Object> strProp(String description) {
        return Map.of("type", "string", "description", description);
    }

    private Map<String, Object> buildClusterLifecycleExtra(String toolName, Map<String, Object> args) {
        Map<String, Object> extra = new java.util.HashMap<>();
        if ("create_cluster".equals(toolName)) {
            extra.put("workers", args.getOrDefault("workers", 0));
            extra.put("cpu", args.getOrDefault("cpu", 2));
            extra.put("memory", args.getOrDefault("memory", 2048));
            extra.put("disk", args.getOrDefault("disk", 20));
            Object serverName = args.get("serverName");
            if (serverName != null) extra.put("serverName", serverName);
        }
        return extra;
    }

    private String buildClusterLifecycleDisplay(String toolName, Map<String, Object> args) {
        String name = (String) args.getOrDefault("clusterName", "?");
        Object serverNameObj = args.get("serverName");
        String serverDisplay = (serverNameObj != null && !serverNameObj.toString().isBlank())
                ? serverNameObj.toString() : "로컬 (기본)";
        return switch (toolName) {
            case "start_cluster" -> "cluster: " + name;
            case "stop_cluster" -> "cluster: " + name;
            case "create_cluster" -> "cluster: " + name
                    + "\nserver: " + serverDisplay
                    + "\nworkers: " + args.getOrDefault("workers", 0)
                    + "\ncpu: " + args.getOrDefault("cpu", 2)
                    + "\nmemory: " + args.getOrDefault("memory", 2048) + "MB"
                    + "\ndisk: " + args.getOrDefault("disk", 20) + "GB";
            default -> "cluster: " + name;
        };
    }
}
