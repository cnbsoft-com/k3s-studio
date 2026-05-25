package com.cnbsoft.mpk3s.common;

public class ResourceNotFoundException extends AppException {
    public ResourceNotFoundException(String resourceType, String id) {
        super("error.resource_not_found", resourceType, id);
    }

    public ResourceNotFoundException(String messageKey, Object... args) {
        super(messageKey, args);
    }
}
