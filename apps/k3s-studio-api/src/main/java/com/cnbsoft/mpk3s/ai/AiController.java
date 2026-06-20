package com.cnbsoft.mpk3s.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;
    private final AiModelConfigRepository configRepository;
    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final AgentTraceRepository agentTraceRepository;

    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(
            @RequestParam(required = false) Long conversationId,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "X-AI-Api-Key", required = false) String apiKey) {

        String message = body.get("message");
        SseEmitter emitter = new SseEmitter(600_000L);
        aiService.streamChat(conversationId, message, apiKey, emitter);
        return emitter;
    }

    @PostMapping("/confirm/{conversationId}")
    public ResponseEntity<Map<String, String>> confirm(@PathVariable Long conversationId) {
        try {
            String result = aiService.confirmPending(conversationId);
            return ResponseEntity.ok(Map.of("message", result));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/cancel/{conversationId}")
    public ResponseEntity<Void> cancel(@PathVariable Long conversationId) {
        aiService.cancelPending(conversationId);
        return ResponseEntity.noContent().build();
    }

    // 활성 프로파일 (채팅에서 사용). 채팅 페이지의 configMissing 판정에도 사용.
    @GetMapping("/config")
    public ResponseEntity<AiModelConfig> getActiveConfig() {
        return configRepository.findFirstByActiveTrueOrderByIdAsc()
                .or(() -> configRepository.findAllByOrderByIdAsc().stream().findFirst())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    // === LLM 서버 프로파일 (스위칭) ===

    @GetMapping("/configs")
    public List<AiModelConfig> listConfigs() {
        return configRepository.findAllByOrderByIdAsc();
    }

    @PostMapping("/configs")
    public AiModelConfig createConfig(@RequestBody AiModelConfig req) {
        AiModelConfig c = new AiModelConfig();
        c.setName(req.getName());
        c.setModelUrl(req.getModelUrl());
        c.setModelName(req.getModelName());
        c.setApiKey(req.getApiKey());
        c.setActive(configRepository.count() == 0); // 첫 프로파일은 자동 활성화
        return configRepository.save(c);
    }

    @PutMapping("/configs/{id}")
    public ResponseEntity<AiModelConfig> updateConfig(@PathVariable Long id, @RequestBody AiModelConfig req) {
        return configRepository.findById(id)
                .map(c -> {
                    c.setName(req.getName());
                    c.setModelUrl(req.getModelUrl());
                    c.setModelName(req.getModelName());
                    // apiKey는 새 값을 보냈을 때만 갱신 (빈 값이면 기존 키 유지)
                    if (req.getApiKey() != null && !req.getApiKey().isBlank()) {
                        c.setApiKey(req.getApiKey());
                    }
                    return ResponseEntity.ok(configRepository.save(c));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/configs/{id}")
    public ResponseEntity<Void> deleteConfig(@PathVariable Long id) {
        configRepository.findById(id).ifPresent(c -> {
            boolean wasActive = c.isActive();
            configRepository.deleteById(id);
            if (wasActive) { // 활성 프로파일을 지웠으면 남은 첫 프로파일을 활성화
                configRepository.findAllByOrderByIdAsc().stream().findFirst().ifPresent(n -> {
                    n.setActive(true);
                    configRepository.save(n);
                });
            }
        });
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/configs/{id}/activate")
    public ResponseEntity<Void> activateConfig(@PathVariable Long id) {
        if (!configRepository.existsById(id)) return ResponseEntity.notFound().build();
        configRepository.findAll().forEach(c -> {
            boolean shouldActive = c.getId().equals(id);
            if (c.isActive() != shouldActive) {
                c.setActive(shouldActive);
                configRepository.save(c);
            }
        });
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/config/test")
    public ResponseEntity<String> testConnection(
            @RequestBody AiModelConfig req,
            @RequestHeader(value = "X-AI-Api-Key", required = false) String apiKey) {
        try {
            String key = (apiKey != null && !apiKey.isBlank()) ? apiKey
                    : (req.getApiKey() != null && !req.getApiKey().isBlank()) ? req.getApiKey() : "ollama";
            RestClient client = RestClient.builder()
                    .baseUrl(req.getModelUrl())
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + key)
                    .build();
            client.get().uri("/v1/models").retrieve().body(String.class);
            return ResponseEntity.ok("ok");
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(e.getMessage());
        }
    }

    @GetMapping("/conversations")
    public List<Conversation> listConversations() {
        return conversationRepository.findAll();
    }

    @GetMapping("/conversations/{id}/messages")
    public List<Message> getMessages(@PathVariable Long id) {
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(id);
    }

    @PatchMapping("/conversations/{id}/title")
    public ResponseEntity<Conversation> updateTitle(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return conversationRepository.findById(id)
                .map(c -> {
                    c.setTitle(body.get("title"));
                    return ResponseEntity.ok(conversationRepository.save(c));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<Void> deleteConversation(@PathVariable Long id) {
        messageRepository.deleteByConversationId(id);
        agentTraceRepository.deleteByConversationId(id);
        conversationRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // === 학습 데이터 라벨링 (Phase 0, PLAN-AI-FINETUNE.md) ===

    @PostMapping("/traces/{traceId}/rating")
    public ResponseEntity<Void> rateTrace(@PathVariable Long traceId, @RequestBody Map<String, String> body) {
        return agentTraceRepository.findById(traceId)
                .map(trace -> {
                    trace.setUserRating(body.get("rating")); // "up" | "down"
                    agentTraceRepository.save(trace);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/traces/{traceId}/exclude")
    public ResponseEntity<Void> excludeTrace(@PathVariable Long traceId, @RequestBody Map<String, Boolean> body) {
        return agentTraceRepository.findById(traceId)
                .map(trace -> {
                    trace.setExcluded(Boolean.TRUE.equals(body.get("excluded")));
                    agentTraceRepository.save(trace);
                    return ResponseEntity.noContent().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
