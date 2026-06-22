/**
 * 클립보드 복사. navigator.clipboard는 보안 컨텍스트(HTTPS/localhost)에서만 동작하므로,
 * LAN IP(http) 접속 등 비보안 컨텍스트에서는 textarea + execCommand 폴백을 사용한다.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("execCommand('copy') returned false");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
