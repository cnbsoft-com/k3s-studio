package com.cnbsoft.mpk3s.server;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ServerRequest {

    @NotBlank
    private String name;

    @NotBlank
    private String host;

    @Min(1) @Max(65535)
    private Integer port = 22;

    @NotBlank
    private String username;

    private String privateKey; // plain PEM - 저장 시 암호화
}
