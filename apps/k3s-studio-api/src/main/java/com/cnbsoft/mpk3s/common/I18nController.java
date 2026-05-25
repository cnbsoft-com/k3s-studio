package com.cnbsoft.mpk3s.common;

import org.springframework.context.MessageSource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;
import java.util.ResourceBundle;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/i18n")
public class I18nController {

    private static final String[] LOCALES = {"ko", "en"};

    @GetMapping("/messages")
    public Map<String, String> getMessages(@RequestParam(defaultValue = "ko") String lang) {
        Locale locale = switch (lang) {
            case "en" -> Locale.ENGLISH;
            default -> Locale.KOREAN;
        };

        ResourceBundle bundle = ResourceBundle.getBundle("messages", locale);
        return bundle.keySet().stream()
                .collect(Collectors.toMap(k -> k, bundle::getString));
    }
}
