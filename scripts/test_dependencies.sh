#!/bin/bash
# =============================================================================
# TikStream AI — 依赖安装与功能测试脚本
# =============================================================================

echo "=========================================="
echo "TikStream AI — 依赖安装与功能测试"
echo "=========================================="

# 检查 Python 版本
echo ""
echo "[1/6] 检查 Python 环境..."
python3 --version || python --version
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python 未安装"
    exit 1
fi

# 安装 Python 依赖
echo ""
echo "[2/6] 安装 Python 依赖..."
$PYTHON_CMD -m pip install --upgrade pip -q
$PYTHON_CMD -m pip install yt-dlp demucs faster-whisper transformers accelerate -q 2>/dev/null || true
echo "✓ Python 依赖安装完成"

# 测试 yt-dlp
echo ""
echo "[3/6] 测试视频下载模块 (yt-dlp)..."
$PYTHON_CMD -c "import yt_dlp; print('✓ yt-dlp 已安装:', yt_dlp.version.__version__)" 2>/dev/null || echo "⚠️ yt-dlp 未安装 (运行: pip install yt-dlp)"

# 测试 demucs
echo ""
echo "[4/6] 测试音频分离模块 (HTDemucs)..."
$PYTHON_CMD -c "import demucs; print('✓ demucs 已安装')" 2>/dev/null || echo "⚠️ demucs 未安装 (运行: pip install demucs)"

# 测试 faster-whisper
echo ""
echo "[5/6] 测试语音识别模块 (Faster-Whisper)..."
$PYTHON_CMD -c "import faster_whisper; print('✓ faster-whisper 已安装')" 2>/dev/null || echo "⚠️ faster-whisper 未安装 (运行: pip install faster-whisper)"

# 检查 FFmpeg
echo ""
echo "[6/6] 检查 FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n 1)
    echo "✓ FFmpeg 已安装: $FFMPEG_VERSION"
else
    echo "⚠️ FFmpeg 未安装"
fi

echo ""
echo "=========================================="
echo "依赖检查完成"
echo "=========================================="
echo ""
echo "安装缺失的依赖:"
echo "  pip install yt-dlp"
echo "  pip install demucs"
echo "  pip install faster-whisper"
echo ""
echo "测试视频下载:"
echo "  python workers/gpu-slicing-worker/python_scripts/video_downloader.py info 'https://www.tiktok.com/@user/video/123'"
echo ""
echo "测试音频分析:"
echo "  python workers/gpu-slicing-worker/python_scripts/audio_analyzer.py check"