# FunASR 本地语音服务

该目录将官方 [modelscope/FunASR](https://github.com/modelscope/FunASR) 的
OpenAI-compatible HTTP API 作为独立容器运行。服务只绑定 Linux 回环地址，
浏览器不能直接访问；GAME Node 后端负责鉴权、大小限制、审计；本地失败直接返回错误，不向云端外发录音。

GAME 同时兼容两种本地 FunASR 传输方式：

- 本目录的 `funasr-server`：HTTP `http://127.0.0.1:8000`。
- 服务器上已有的 `paraformer-online` runtime：WebSocket，通常是
  `ws://127.0.0.1:10095`。该服务不是 HTTP 接口，不能把 10095 填进
  `FUNASR_BASE_URL=http://...`。

## 启动

```bash
cd deploy/funasr
cp .env.example .env
docker compose -f compose.yml up -d --build
docker compose -f compose.yml logs -f funasr
```

第一次启动会下载并加载模型，耗时取决于网络与机器性能。默认使用
`SenseVoiceSmall + cpu`，自动识别中文和英语；并按 2 核 4G 服务器限制为 2 个计算线程、1.75 核 CPU、
2.5G 内存上限与 512M shm，适合短语音单并发；有可用 CUDA 环境时，需要自行把
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
FUNASR_LANGUAGE=auto
FUNASR_TIMEOUT_MS=20000
FUNASR_MAX_CONCURRENCY=1
```

如果业务确定只有中文，可以把模型切换为 `paraformer` 并设置
`FUNASR_LANGUAGE=zh`，通常能换取更高的中文专用准确率；英语专用场景可使用
`paraformer-en` 与 `FUNASR_LANGUAGE=en`。中英混合或语言不确定时保持
`sensevoice + auto`。

如果继续使用服务器上已经运行的 `paraformer-online`，不要使用上面的 HTTP
配置，改为：

```dotenv
FUNASR_TRANSPORT=websocket
FUNASR_WS_URL=ws://127.0.0.1:10095
FUNASR_WS_MODE=2pass
FUNASR_WS_CHUNK_SIZE=5,10,5
FUNASR_WS_CHUNK_INTERVAL=10
FUNASR_TIMEOUT_MS=20000
FUNASR_MAX_CONCURRENCY=1
```

注意：`paraformer-online` 是中文流式运行时，不能靠设置 `language=auto` 变成
英语模型。需要中英双语时，请使用上面的 HTTP `sensevoice` 配置；需要中文专用
最高准确率时，再切换到 `paraformer`。

浏览器录音会先生成 16 kHz、单声道、16-bit WAV；GAME 后端在 WebSocket
模式下去掉 WAV 头并按 runtime 要求发送原始 PCM。这样不需要让浏览器直接连接
FunASR，也不需要把 10095 暴露到公网。

重启 GAME 后端后，语音请求会优先走 FunASR；FunASR 超时、离线或返回错误时，
后端直接返回可重试的错误，不使用云端回退。不要把 FunASR 的 8000 端口绑定
到 `0.0.0.0`，也不要通过 Nginx 将它直接暴露给公网。

## 2 核 4G 注意事项

- 建议给 Linux 配置至少 2G swap，并用 `free -h` 确认已生效；swap 是防止首次
  模型加载 OOM 的保险，不代表可以提高并发。
- `FUNASR_MAX_CONCURRENCY=1` 会让 GAME 后端只向本地模型发送一路推理；本地正忙
  时第二路请求返回繁忙，避免叠加推理把机器拖死。
- 当前容器提供 OpenAI-compatible HTTP API。官方 ONNX WebSocket runtime 的
  `--decoder-thread-num` 不适用于这个入口，不要直接追加到 `funasr-server` 命令。
- 如果使用已有 WebSocket runtime，先用 `ss -ltnp | grep 10095` 确认真实端口，
  再把 `FUNASR_WS_URL` 改成对应的 loopback 地址。
- 不要放行 8000、10095 或 30035 安全组端口。浏览器只访问 GAME 的 HTTPS
  域名，Node 通过 loopback 调用 FunASR。

## 本次录音修复与验证边界

识别结果完整返回 JSON；没有把完成全文拆字伪装实时识别。默认 20 秒超时，浏览器允许 35 秒含上传；长录音在 2 核 4G 上可能超过限时，请先测试 5–15 秒语音。Node 断连立即取消上游连接并释放槽位，但离线 CPU 模型可能继续完成已开始的计算，不能声称硬中断推理。连续第二次录音、取消后重试、中文/英文标点、HTTP/WS 真实协议和峰值内存仍需在目标服务器实测。

默认 Docker 使用官方 funasr-server。server.py 是可选离线适配器，不是 compose 启动入口；使用时应显式配置并自行安装依赖。

### WebSocket 完整性要求

`is_final` 只代表 VAD 分段完成，不能当作整段录音完成。Node 会累计所有离线分段，等待独立 `is_end: true` 确认后才返回全文；缺少确认会超时报错而不是静默截断。旧 WS 服务若没有该结束确认，需要适配服务端协议，或切到本目录推荐的完整 HTTP 返回接口；不要用第一段 final 冒充全文。
