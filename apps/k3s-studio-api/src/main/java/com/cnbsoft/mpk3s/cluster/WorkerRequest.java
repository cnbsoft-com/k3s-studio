package com.cnbsoft.mpk3s.cluster;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class WorkerRequest {

    @NotBlank
    private String workerSpec;   // small | medium | large | custom

    @Min(1) @Max(10)
    private int workerCount = 1;

    private Integer workerCpus;
    private String workerMemory;
    private String workerDisk;
}
