package com.cnbsoft.mpk3s.ai;

import com.cnbsoft.mpk3s.cluster.ClusterRepository;
import com.cnbsoft.mpk3s.k8s.K8sService;
import com.cnbsoft.mpk3s.server.ServerRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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

    @Async("aiTaskExecutor")
    public CompletableFuture<Void> streamChat(Long conversationId, String userMessage, String apiKey, SseEmitter emitter) {
        try {
            AiModelConfig config = configRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new IllegalStateException("AI 모델 설정이 없습니다. /settings/ai 에서 설정해주세요."));

            // Load or create conversation
            Conversation conversation = conversationId != null
                    ? conversationRepository.findById(conversationId).orElseGet(() -> conversationRepository.save(new Conversation()))
                    : conversationRepository.save(new Conversation());

            // Save user message
            Message userMsg = new Message();
            userMsg.setConversationId(conversation.getId());
            userMsg.setRole("user");
            userMsg.setContent(userMessage);
            messageRepository.save(userMsg);

            // Build message history
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
                    // Standard OpenAI tool_calls format
                    messages.add(objectMapper.convertValue(assistantMsg, new TypeReference<>() {}));
                    for (JsonNode toolCall : assistantMsg.path("tool_calls")) {
                        String toolCallId = toolCall.path("id").asText();
                        String toolName = toolCall.path("function").path("name").asText();
                        String argsJson = toolCall.path("function").path("arguments").asText();
                        emitter.send(SseEmitter.event().name("tool").data("⚙ " + toolName + " 실행 중..."));
                        String toolResult;
                        try {
                            toolResult = executeTool(toolName, objectMapper.readValue(argsJson, new TypeReference<>() {}));
                        } catch (Exception e) {
                            toolResult = "오류: " + e.getMessage();
                        }
                        messages.add(Map.of("role", "tool", "tool_call_id", toolCallId, "content", toolResult));
                    }
                    continue;
                }

                // Fallback: some models output tool calls as JSON in content
                if (!textContent.isBlank()) {
                    try {
                        JsonNode parsed = objectMapper.readTree(textContent.trim());
                        if (parsed.isObject() && parsed.has("name") && parsed.has("arguments")) {
                            String toolName = parsed.path("name").asText();
                            Map<String, Object> args = objectMapper.convertValue(parsed.path("arguments"), new TypeReference<>() {});
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

                // Regular text response
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

            // Save assistant reply
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

    private List<Map<String, Object>> buildMessages(Long conversationId, String currentUserMessage) {
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", buildSystemPrompt()));

        List<Message> history = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId);
        // Exclude the message we just saved (last one is the current user message)
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
                위험한 작업(삭제, apply)을 실행할 때는 실행 전에 어떤 작업을 할 것인지 사용자에게 알려주세요.
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
            case "list_pods" -> {
                String cluster = (String) args.get("clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                var pods = k8sService.getPods(cluster, ns);
                yield objectMapper.writeValueAsString(pods);
            }
            case "get_pod_logs" -> {
                String cluster = (String) args.get("clusterName");
                String ns = (String) args.getOrDefault("namespace", "default");
                String pod = (String) args.get("podName");
                int tail = Math.min(((Number) args.getOrDefault("tail", 50)).intValue(), 200);
                yield k8sService.getPodLogs(cluster, ns, pod, tail);
            }
            case "list_namespaces" -> {
                String cluster = (String) args.get("clusterName");
                yield objectMapper.writeValueAsString(k8sService.getNamespaces(cluster));
            }
            case "apply_manifest" -> {
                String cluster = (String) args.get("clusterName");
                String yaml = (String) args.get("yaml");
                k8sService.applyManifest(cluster, yaml);
                yield "매니페스트 적용 완료";
            }
            case "delete_manifest" -> {
                String cluster = (String) args.get("clusterName");
                String yaml = (String) args.get("yaml");
                k8sService.deleteManifest(cluster, yaml);
                yield "매니페스트 삭제 완료";
            }
            default -> "알 수 없는 도구: " + name;
        };
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
                tool("get_pod_logs", "파드 로그 조회 (최대 200줄)",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "namespace", strProp("네임스페이스"),
                                "podName", strProp("파드 이름"),
                                "tail", Map.of("type", "integer", "description", "조회할 줄 수 (기본 50, 최대 200)")
                        ), "required", List.of("clusterName", "namespace", "podName"))),
                tool("apply_manifest", "YAML 매니페스트 적용",
                        Map.of("type", "object", "properties", Map.of(
                                "clusterName", strProp("클러스터 이름"),
                                "yaml", strProp("적용할 YAML 내용")
                        ), "required", List.of("clusterName", "yaml"))),
                tool("delete_manifest", "YAML 매니페스트 삭제",
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
