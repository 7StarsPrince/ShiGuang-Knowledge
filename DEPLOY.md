# 拾光知识库部署指南

## 环境要求

- **Node.js** >= 18
- **Python** >= 3.9（推荐 3.9.x）
- **ffmpeg**（音频格式转换需要）

## 1. 安装 Node.js 依赖

```bash
cd insight-vault
npm install
```

## 2. 安装 Python 依赖

```bash
pip3 install -r requirements.txt
```

> **重要**: 人声分离（noisereduce）对 scipy/numpy 版本敏感，务必使用 requirements.txt 中锁定的版本，否则降噪效果会不同。

### 验证 Python 环境

```bash
python3 -c "
import noisereduce; print(f'noisereduce: {noisereduce.__version__}')
import scipy; print(f'scipy: {scipy.__version__}')
import numpy; print(f'numpy: {numpy.__version__}')
import soundfile; print(f'soundfile: {soundfile.__version__}')
"
```

预期输出（与开发环境一致）：
```
noisereduce: 3.0.3
scipy: 1.13.1
numpy: 1.26.4
soundfile: 0.13.1
```

## 3. 安装 ffmpeg

### macOS
```bash
brew install ffmpeg
```

### Ubuntu/Debian
```bash
sudo apt update && sudo apt install ffmpeg
```

### CentOS/RHEL
```bash
sudo yum install ffmpeg
```

## 4. 配置 LLM（OCR 与 AI 分析必需）

本系统使用 OpenAI 兼容协议的 LLM 进行论文 OCR、内容分析、翻译、解释等功能。

### 4.1 环境变量方式

复制 `.env.local` 并填写：

```bash
cp .env.local .env.local
```

编辑 `.env.local`：

```bash
# LLM 服务商: glm / kimi / deepseek / custom
LLM_PROVIDER=glm

# API Key（必须）
LLM_API_KEY=your-api-key-here

# 对话模型
LLM_MODEL=glm-4-flash

# 视觉模型（用于 OCR 和 PDF 图片识别）
LLM_VISION_MODEL=glm-4v

# 自定义 baseUrl，仅当 LLM_PROVIDER=custom 时必填
# LLM_BASE_URL=https://your-api-endpoint.com/v1
```

### 4.2 内置服务商默认配置

| 服务商 | baseUrl | 对话模型 | 视觉模型 |
|--------|---------|----------|----------|
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | `glm-4v` |
| Kimi Coding | `https://api.kimi.com/coding/v1` | `kimi-for-coding` | `kimi-k2-0711-preview` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` | 无 |
| custom | 通过 `LLM_BASE_URL` 指定 | 通过 `LLM_MODEL` 指定 | 通过 `LLM_VISION_MODEL` 指定 |

### 4.3 网页端配置方式

启动应用后，也可以在「AI 设置」页面中配置 LLM，配置会保存在 `data/llm-config.json`，优先级高于环境变量。

### 4.4 OCR 须知

- OCR 功能依赖**视觉模型**（vision model），必须配置支持图片输入的模型。
- 当 PDF 导入或阅读时，系统会先用 `pdf-parse` 提取文字；若字数过少（疑似扫描版/图片 PDF），则自动调用视觉模型进行 OCR。
- OCR 流程：`PyMuPDF` 把 PDF 页面渲染为 PNG → 视觉模型识别图片文字。

## 5. 初始化数据库

首次启动会自动创建 SQLite 数据库（`data/insight-vault.db`）。

## 6. 构建并启动

```bash
npm run build
npm run start
# 或开发模式: npm run dev
```

默认端口 **3600**，访问 http://localhost:3600

## 人声分离效果差异排查

如果人声分离效果与预期不符，按以下顺序检查：

1. **Python 包版本** — 运行上面的验证命令，对比版本号
2. **scipy 版本** — 这是最常见的原因，`noisereduce` 的 `stationary=False` 模式内部调用 `scipy.signal`，不同版本频谱运算结果不同
3. **numpy 版本** — FFT 实现在不同版本间有细微差异
4. **soundfile 版本** — 影响音频读写精度

```bash
# 如果版本不一致，强制重装
pip3 install -r requirements.txt --force-reinstall
```

## 功能说明

| 功能 | 实现 | Python 脚本 |
|------|------|-------------|
| 人声分离（noisereduce） | 多遍频谱门控降噪 | `scripts/enhance_audio_demucs.py` |
| 人声分离（DeepFilterNet） | 深度学习降噪 | `scripts/enhance_audio.py` |
| Whisper 语音识别 | OpenAI Whisper 本地推理 | `scripts/transcribe_whisper.py` |
| 导出 MP3 | ffmpeg WAV→MP3 转换 | API 内置 |
| PDF 页面渲染 | PyMuPDF 渲染为 PNG | `scripts/render-pdf-pages.py` |
| PDF OCR | 视觉模型识别 PNG 文字 | `src/app/api/papers/ocr/route.ts` |
| PDF 元数据提取 | 视觉模型或文本 LLM | `src/app/api/papers/import-pdf/route.ts` |
