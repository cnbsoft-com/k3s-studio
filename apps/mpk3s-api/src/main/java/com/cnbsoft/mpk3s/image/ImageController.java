package com.cnbsoft.mpk3s.image;

import com.cnbsoft.mpk3s.multipass.MultipassService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/images")
@RequiredArgsConstructor
public class ImageController {

    private final MultipassService multipassService;

    @GetMapping
    public List<String> listImages() throws Exception {
        return multipassService.listImages();
    }
}
