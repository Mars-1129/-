@echo off
REM =============================================================================
REM TikStream AI — 依赖安装与功能测试脚本 (Windows)
REM =============================================================================

echo ==========================================
echo TikStream AI — 依赖安装与功能测试
echo ==========================================

REM 检查 Python 版本
echo.
echo [1/6] 检查 Python 环境...
python --version
if errorlevel 1 (
    echo ❌ Python 未安装
    exit /b 1
)

REM 安装 Python 依赖
echo.
echo [2/6] 安装 Python 依赖...
pip install --upgrade pip -q
pip install yt-dlp demucs faster-whisper transformers accelerate -q
echo ✓ Python 依赖安装完成

REM 测试 yt-dlp
echo.
echo [3/6] 测试视频下载模块 (yt-dlp)...
python -c "import yt_dlp; print('✓ yt-dlp 已安装:', yt_dlp.version.__version__)"
if errorlevel 1 (
    echo ⚠️ yt-dlp 未安装
)

REM 测试 demucs
echo.
echo [4/6] 测试音频分离模块 (HTDemucs)...
python -c "import demucs; print('✓ demucs 已安装')"
if errorlevel 1 (
    echo ⚠️ demucs 未安装
)

REM 测试 faster-whisper
echo.
echo [5/6] 测试语音识别模块 (Faster-Whisper)...
python -c "import faster_whisper; print('✓ faster-whisper 已安装')"
if errorlevel 1 (
    echo ⚠️ faster-whisper 未安装
)

REM 检查 FFmpeg
echo.
echo [6/6] 检查 FFmpeg...
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo ⚠️ FFmpeg 未安装
) else (
    echo ✓ FFmpeg 已安装
)

echo.
echo ==========================================
echo 依赖检查完成
echo ==========================================
echo.
echo 安装缺失的依赖:
echo   pip install yt-dlp
echo   pip install demucs
echo   pip install faster-whisper
echo.
echo 测试视频下载:
echo   python workers/gpu-slicing-worker/python_scripts/video_downloader.py info "https://www.tiktok.com/@user/video/123"
echo.
echo 测试音频分析:
echo   python workers/gpu-slicing-worker/python_scripts/audio_analyzer.py check

pause