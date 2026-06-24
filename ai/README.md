# AI 환경

로컬 AI 추론/파인튜닝 작업용 Python 환경. Apple Silicon에서 [MLX](https://github.com/ml-explore/mlx) 기반으로 동작하며, [`rapid-mlx`](https://pypi.org/project/rapid-mlx/)를 사용한다.

## 요구사항

- macOS (Apple Silicon)
- Python 3.14+

## 환경 구성

```bash
# 프로젝트 루트에서 (venv 생성 + 의존성 설치를 한 번에)
./ai/setup.sh
source ai/.venv/bin/activate
```

수동으로 하려면:

```bash
python3 -m venv ai/.venv
source ai/.venv/bin/activate
pip install -r ai/requirements.txt
```

> `ai/.venv/`는 `.gitignore`로 제외되어 있으므로 위 명령으로 직접 생성한다.

## 활성화 / 비활성화

```bash
source ai/.venv/bin/activate   # 활성화
deactivate                     # 비활성화
```

## 동작 확인

```bash
python -c "import mlx.core as mx, mlx_lm; print('mlx', mx.__version__)"
```

## 스크립트

| 스크립트 | 설명 |
| --- | --- |
| `setup.sh` | venv 생성 + 의존성 설치 |
| `serve.sh` | rapid-mlx OpenAI 호환 API 서버 실행 |
| `infer.py` | mlx-lm 단발 추론 예제 |

### 서버 실행

```bash
./ai/serve.sh                        # 기본 모델(qwen3.5-4b-4bit), 포트 8000
./ai/serve.sh qwen3.5-9b-4bit 8080   # 모델/포트 지정
```

서버는 OpenAI 호환 엔드포인트(`/v1/chat/completions`)를 제공한다.

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.5-4b-4bit","messages":[{"role":"user","content":"안녕"}]}'
```

### 추론 예제

```bash
python ai/infer.py "Apple Silicon에서 MLX란?"
MODEL=mlx-community/Qwen3.5-4B-MLX-4bit python ai/infer.py "..."
```

> 모델은 최초 실행 시 HuggingFace 캐시로 다운로드된다.

## 의존성 갱신

```bash
pip install <package>
pip freeze > ai/requirements.txt
```
