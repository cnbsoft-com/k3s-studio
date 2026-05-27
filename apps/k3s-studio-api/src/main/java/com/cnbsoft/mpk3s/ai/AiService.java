package com.cnbsoft.mpk3s.ai;

import com.cnbsoft.mpk3s.cluster.ClusterRepository;
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

import java.io.IOException;
import java.util.ArrayList;
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
    private final K8sService k8sService;
    private final ObjectMapper objectMapper;

    // conversationId → 승인 대기 중인 매니페스트 작업
    private final ConcurrentHashMap<Long, PendingOperation> pendingOps = new ConcurrentHashMap<>();

    public record PendingOperation(String action, String yaml, String clusterName) {}

    @Async("aiTaskExecutor")
    public CompletableFuture<Void> streamChat(Long conversationId, String userMessage, String apiKey, SseEmitter emitter) {
        try {
            AiModelConfig config = configRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new IllegalStateException("AI 모델 설정이 없습니다. /settings/ai 에서 설정해주세요."));

            Conversation conversation = conversationId != null
                    ? conversationRepository.findById(conversationId).orElseGet(() -> conversationRepository.save(new Conversation()))
                    : conversationRepository.save(new Conversation());

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
                String responseBody = callModel(client, config.getModelName(), messages, tools);
                JsonNode response = objectMapper.readTree(responseBody);
                JsonNode choice = response.path("choices").path(0);
                JsonNode assistantMsg = choice.path("message");
                String textContent = assistantMsg.path("content").asText("");

                boolean hasToolCalls = assistantMsg.has("tool_calls")
                        && assistantMsg.path("tool_calls").isArray()
                        && !assistantMsg.path("tool_calls").isEmpty();

                if (hasToolCalls) {
                    messages.add(objectMapper.convertValue(assistantMsg, new TypeReference<>() {}));
                    for (JsonNode toolCall : assistantMsg.path("tool_calls")) {
                        String toolCallId = toolCall.path("id").asText();
                        String toolName = toolCall.path("function").path("name").asText();
                        String argsJson = toolCall.path("function").path("arguments").asText();
                        Map<String, Object> args = objectMapper.readValue(argsJson, new TypeReference<>() {});

                        // apply/delete: 즉시 실행하지 않고 preview 이벤트로 사용자 확인 요청
                        if ("apply_manifest".equals(toolName) || "delete_manifest".equals(toolName)) {
                            String yaml = (String) args.getOrDefault("yaml", "");
                            String cluster = (String) args.getOrDefault("clusterName", "");
                            // 이미 pending이 있으면 skip (한 응답에 두 번 apply/delete 방지)
                            if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, yaml, cluster)) == null) {
                                String previewPayload = objectMapper.writeValueAsString(
                                        Map.of("action", toolName, "yaml", yaml, "clusterName", cluster));
                                emitter.send(SseEmitter.event().name("preview").data(previewPayload));
                            }
                            // preview 후 스트림 종료 — 사용자가 /confirm or /cancel 호출
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

                // Fallback: JSON content에 tool call
                if (!textContent.isBlank()) {
                    try {
                        JsonNode parsed = objectMapper.readTree(textContent.trim());
                        if (parsed.isObject() && parsed.has("name") && parsed.has("arguments")) {
                            String toolName = parsed.path("name").asText();
                            Map<String, Object> args = objectMapper.convertValue(parsed.path("arguments"), new TypeReference<>() {});

                            if ("apply_manifest".equals(toolName) || "delete_manifest".equals(toolName)) {
                                String yaml = (String) args.getOrDefault("yaml", "");
                                String cluster = (String) args.getOrDefault("clusterName", "");
                                if (pendingOps.putIfAbsent(conversation.getId(), new PendingOperation(toolName, yaml, cluster)) == null) {
                                    String previewPayload = objectMapper.writeValueAsString(
                                            Map.of("action", toolName, "yaml", yaml, "clusterName", cluster));
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

                if (!textContent.isBlank()) {
                    emitter.send(SseEmitter.event().data(textContent));
                    fullResponse.append(textContent);
                }
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
                emitter.send(SseEmitter.event().name("error").data(e.getMessage()));
                emitter.complete();
            } catch (IOException ignored) {}
        }
        return CompletableFuture.completedFuture(null);
    }

    public String confirmPending(Long conversationId) throws Exception {
        PendingOperation op = pendingOps.remove(conversationId);
        if (op == null) throw new IllegalStateException("대기 중인 작업이 없습니다.");

        if ("apply_manifest".equals(op.action())) {
            k8sService.applyManifest(op.clusterName(), op.yaml());
            saveManifestMessage(conversationId, op.action(), op.yaml(), "매니페스트 적용 완료");
            return "매니페스트 적용 완료";
        } else {
            k8sService.deleteManifest(op.clusterName(), op.yaml());
            saveManifestMessage(conversationId, op.action(), op.yaml(), "매니페스트 삭제 완료");
            return "매니페스트 삭제 완료";
        }
    }

    public void cancelPending(Long conversationId) {
        pendingOps.remove(conversationId);
    }

    private void saveManifestMessage(Long conversationId, String action, String yaml, String result) {
        String role = "apply_manifest".equals(action) ? "적용" : "삭제";
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
                - apply_manifest는 서버가 사용자에게 자동으로 미리보기를 보여주고 확인을 요청합니다.

                NodePort 서비스를 생성(apply_manifest)하여 사용자가 confirm한 후에는 반드시:
                1. list_services를 호출하여 할당된 nodePort를 확인하세요.
                2. list_nodes를 호출하여 노드의 InternalIP를 확인하세요.
                3. 접근 가능한 URL http://{InternalIP}:{nodePort}를 사용자에게 알려주세요.

                응답은 한국어로 합니다.
                """.formatted(serverCount, clusterCount);
    }

    private RestClient buildRestClient(String modelUrl, String apiKey) {
        return RestClient.builder()
                .baseUrl(modelUrl)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + (apiKey != null ? apiKey : "ollama"))
                .build();
    }

    private String callModel(RestClient client, String modelName, List<Map<String, Object>> messages, List<Map<String, Object>> tools) {
        Map<String, Object> body = Map.of(
                "model", modelName,
                "messages", messages,
                "tools", tools,
                "stream", false
        );
        return client.post()
                .uri("/v1/chat/completions")
                .body(body)
                .retrieve()
                .body(String.class);
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
}
