package com.cnbsoft.mpk3s.common;

public class DuplicateNameException extends AppException {
    public DuplicateNameException(String name) {
        super("error.duplicate_name", name);
    }
}
