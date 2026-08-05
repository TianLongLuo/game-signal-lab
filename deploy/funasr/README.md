# FunASR 本地语音服务

该目录将官方 [modelscope/FunASR](https://github.com/modelscope/FunASR) 的
OpenAI-compatible API 作为独立容器运行。服务只绑定 Linux 回环地址，浏览器
不能直接访问；GAME Node 后端负责鉴权、大小限制、审计和 MiMo 回退。

## 启动

```bash
cd deploy/funasr
cp .env.example .env
docker compose -f compose.yml up -d --build
docker compose -f compose.yml logs -f funasr
```

第一次启动会下载并加载模型，耗时取决于网络与机器性能。默认使用
`sensevoice + cpu`，适合先验证中文短录音；有可用 CUDA 环境时，需要自行把
镜像的 PyTorch 换成匹配服务器 CUDA 的版本后再设 `FUNASR_DEVICE=cuda`。

健康检查与模型列表：

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/v1/models
```

随后在 `/etc/game-signal-lab/game.env` 加入：

```dotenv
FUNASR_BASE_URL=http://127.0.0.1:8000
FUNASR_MODEL=sensevoice
FUNASR_TIMEOUT_MS=30000
```

重启 GAME 后端后，语音请求会优先走 FunASR；FunASR 超时、离线或返回错误时，
后端自动使用管理员后台已经配置的 MiMo ASR。不要把 FunASR 的 8000 端口绑定
到 `0.0.0.0`，也不要通过 Nginx 将它直接暴露给公网。
