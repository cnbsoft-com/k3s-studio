package com.cnbsoft.mpk3s.common;

public class DuplicateNameException extends RuntimeException {
    public DuplicateNameException(String name) {
        super("이미 존재하는 이름입니다: " + name);
    }
}
