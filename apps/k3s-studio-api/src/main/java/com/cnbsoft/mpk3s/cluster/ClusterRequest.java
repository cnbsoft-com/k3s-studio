package com.cnbsoft.mpk3s.cluster;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.util.Map;

@Data
public class ClusterRequest {

    private Long serverId;

    @NotBlank
    @Pattern(regexp = "^[a-z0-9][a-z0-9-]*[a-z0-9]$", message = "영문 소문자, 숫자, 하이픈만 허용 (시작/끝은 영문 또는 숫자)")
    @Size(max = 50)
    private String name;

    @NotBlank
    private String masterSpec;   // small | medium | large | custom

    private Integer masterCpus;
    private String masterMemory;
    private String masterDisk;

    @Min(0) @Max(20)
    private int workerCount;

    @NotBlank
    private String workerSpec;
    private Integer workerCpus;
    private String workerMemory;
    private String workerDisk;

    @NotBlank
    private String ubuntuImage;

    // K3s 컴포넌트 옵션 (true = 활성화)
    private Map<String, Boolean> options;

    // 브리지 네트워크 (선택 사항) — null이면 기존 DHCP 동작
    private String networkInterface;
    private String networkInterfaceCidr;
}
