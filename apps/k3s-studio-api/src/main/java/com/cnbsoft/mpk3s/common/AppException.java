package com.cnbsoft.mpk3s.common;

public class AppException extends RuntimeException {
    private final String messageKey;
    private final Object[] args;

    public AppException(String messageKey, Object... args) {
        super(messageKey);
        this.messageKey = messageKey;
        this.args = args;
    }

    public String getMessageKey() {
        return messageKey;
    }

    public Object[] getArgs() {
        return args;
    }
}
