package com.cnbsoft.mpk3s.job;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class JobService {

    private final JobRepository jobRepository;
    private final Map<UUID, SseEmitter> emitters = new ConcurrentHashMap<>();

    @Transactional
    public Job createJob(String clusterName, JobType type) {
        return createJob(clusterName, null, type);
    }

    @Transactional
    public Job createJob(String clusterName, Long serverId, JobType type) {
        Job job = new Job();
        job.setClusterName(clusterName);
        job.setServerId(serverId);
        job.setType(type);
        job.setStatus(JobStatus.PENDING);
        return jobRepository.save(job);
    }

    @Transactional
    public void start(UUID jobId) {
        jobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.RUNNING);
            jobRepository.save(job);
        });
    }

    @Transactional
    public void appendLog(UUID jobId, String line) {
        jobRepository.findById(jobId).ifPresent(job -> {
            job.appendLog(line);
            jobRepository.save(job);
            sendSseEvent(jobId, line);
        });
    }

    @Transactional
    public void complete(UUID jobId) {
        jobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.SUCCESS);
            job.setFinishedAt(OffsetDateTime.now());
            jobRepository.save(job);
            sendSseComplete(jobId);
        });
    }

    @Transactional
    public void fail(UUID jobId, String reason) {
        jobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.FAILED);
            job.setFinishedAt(OffsetDateTime.now());
            job.appendLog("[ERROR] " + reason);
            jobRepository.save(job);
            sendSseError(jobId, reason);
        });
    }

    public Job getJob(UUID jobId) {
        return jobRepository.findById(jobId)
                .orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
    }

    public SseEmitter streamJob(UUID jobId) {
        SseEmitter emitter = new SseEmitter(30 * 60 * 1000L); // 30분 타임아웃
        emitters.put(jobId, emitter);
        emitter.onCompletion(() -> emitters.remove(jobId));
        emitter.onTimeout(() -> emitters.remove(jobId));
        emitter.onError(e -> emitters.remove(jobId));

        // 현재까지 쌓인 로그를 즉시 전송
        jobRepository.findById(jobId).ifPresent(job -> {
            if (job.getLog() != null) {
                try {
                    emitter.send(SseEmitter.event().name("log").data(job.getLog()));
                } catch (IOException e) {
                    log.warn("Failed to send initial log for job {}", jobId);
                }
            }
            if (job.getStatus() == JobStatus.SUCCESS || job.getStatus() == JobStatus.FAILED) {
                try {
                    emitter.send(SseEmitter.event().name("done").data(job.getStatus().name()));
                    emitter.complete();
                } catch (IOException e) {
                    log.warn("Failed to send done event for job {}", jobId);
                }
            }
        });

        return emitter;
    }

    private void sendSseEvent(UUID jobId, String line) {
        SseEmitter emitter = emitters.get(jobId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event().name("log").data(line));
            } catch (IOException e) {
                emitters.remove(jobId);
            }
        }
    }

    private void sendSseComplete(UUID jobId) {
        SseEmitter emitter = emitters.get(jobId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event().name("done").data("SUCCESS"));
                emitter.complete();
            } catch (IOException e) {
                emitters.remove(jobId);
            }
        }
    }

    private void sendSseError(UUID jobId, String reason) {
        SseEmitter emitter = emitters.get(jobId);
        if (emitter != null) {
            try {
                emitter.send(SseEmitter.event().name("error").data(reason));
                emitter.complete();
            } catch (IOException e) {
                emitters.remove(jobId);
            }
        }
    }
}
