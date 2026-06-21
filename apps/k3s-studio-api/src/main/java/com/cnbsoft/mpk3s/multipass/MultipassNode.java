package com.cnbsoft.mpk3s.multipass;

import lombok.Data;

import java.util.List;

@Data
public class MultipassNode {
    private String name;
    private String state;
    private String ipv4;
    private List<String> ipv4Addresses;
    private String image;
    private String cpus;
    private String memory;
    private String disk;
}
