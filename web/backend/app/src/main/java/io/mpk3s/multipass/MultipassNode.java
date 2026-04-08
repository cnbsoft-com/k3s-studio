package io.mpk3s.multipass;

import lombok.Data;

@Data
public class MultipassNode {
    private String name;
    private String state;
    private String ipv4;
    private String image;
    private String cpus;
    private String memory;
    private String disk;
}
