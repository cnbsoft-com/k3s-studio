#!/usr/bin/env python
"""mlx-lm으로 모델을 로드해 프롬프트를 생성하는 최소 추론 예제.

사용:
    python ai/infer.py "안녕, 너는 누구야?"
    MODEL=mlx-community/Qwen3.5-4B-4bit python ai/infer.py "..."

모델은 최초 실행 시 HuggingFace 캐시로 다운로드된다.
"""
import os
import sys

from mlx_lm import generate, load

MODEL = os.environ.get("MODEL", "mlx-community/Qwen3.5-4B-MLX-4bit")


def main() -> None:
    prompt = sys.argv[1] if len(sys.argv) > 1 else "Apple Silicon에서 MLX란?"

    model, tokenizer = load(MODEL)
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(
        messages, add_generation_prompt=True, tokenize=False
    )

    response = generate(model, tokenizer, prompt=text, max_tokens=512, verbose=True)
    print(response)


if __name__ == "__main__":
    main()
