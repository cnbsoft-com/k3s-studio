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

    @GetMapping("/config")
    public ResponseEntity<AiModelConfig> getConfig() {
        return configRepository.findAll().stream().findFirst()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @PutMapping("/config")
    public AiModelConfig saveConfig(@RequestBody AiModelConfig req) {
        return configRepository.findAll().stream().findFirst()
                .map(existing -> {
                    existing.setModelUrl(req.getModelUrl());
                    existing.setModelName(req.getModelName());
                    return configRepository.save(existing);
                })
                .orElseGet(() -> configRepository.save(req));
    }

    @PostMapping("/config/test")
    public ResponseEntity<String> testConnection(
            @RequestBody AiModelConfig req,
            @RequestHeader(value = "X-AI-Api-Key", required = false) String apiKey) {
        try {
            RestClient client = RestClient.builder()
                    .baseUrl(req.getModelUrl())
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + (apiKey != null ? apiKey : "ollama"))
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
        conversationRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
