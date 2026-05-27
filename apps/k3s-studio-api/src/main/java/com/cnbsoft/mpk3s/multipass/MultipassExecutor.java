package com.cnbsoft.mpk3s.multipass;

import java.io.IOException;
import java.util.function.Consumer;

public interface MultipassExecutor {

    /** multipass 명령 실행 후 전체 출력 반환 */
    String execMultipass(String... args) throws IOException, InterruptedException;

    /** multipass 명령 실행 + 실시간 로그 스트리밍 */
    void execMultipassStreaming(Consumer<String> logConsumer, String... args)
            throws IOException, InterruptedException;

    /** OS 감지 등 임의 명령 실행 */
    String execRaw(String command) throws IOException, InterruptedException;

    /** 원격(또는 로컬) 경로에 파일 내용 업로드 */
    void uploadFile(String remotePath, String content) throws IOException, InterruptedException;
}
