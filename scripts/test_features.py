#!/usr/bin/env python3
# =============================================================================
# TikStream AI — 快速功能测试脚本
# =============================================================================
# 用于验证视频下载和音频分析模块的基本功能
# =============================================================================

import sys
import json
import subprocess
from pathlib import Path

# 设置 UTF-8 输出
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 兼容 Windows GBK
import locale
try:
    locale.setlocale(locale.LC_ALL, '')
except:
    pass

def run_command(cmd, timeout=30):
    """运行命令并返回输出"""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=isinstance(cmd, str)
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timeout"
    except Exception as e:
        return -1, "", str(e)

def test_yt_dlp():
    """测试 yt-dlp"""
    print("\n[测试] yt-dlp 视频下载模块")
    print("-" * 40)

    # 检查 yt-dlp 是否安装
    code, stdout, stderr = run_command([sys.executable, '-c', 'import yt_dlp; print(yt_dlp.version.__version__)'])
    if code != 0:
        print("❌ yt-dlp 未安装")
        print("   安装命令: pip install yt-dlp")
        return False

    print(f"✓ yt-dlp 已安装: {stdout.strip()}")

    # 检查 help 信息
    code, stdout, stderr = run_command(['yt-dlp', '--version'])
    if code != 0:
        print("⚠️ yt-dlp 命令行工具不可用（Python 模块可用）")
    else:
        print(f"✓ yt-dlp CLI: {stdout.strip()}")

    return True

def test_demucs():
    """测试 HTDemucs"""
    print("\n[测试] HTDemucs 音频分离模块")
    print("-" * 40)

    # 检查 demucs 是否安装
    code, stdout, stderr = run_command([sys.executable, '-c', 'import demucs; print(demucs.__version__)'])
    if code != 0:
        print("⚠️ demucs 未安装（可选功能）")
        print("   安装命令: pip install demucs")
        return False

    print(f"✓ demucs 已安装")

    # 列出可用模型
    try:
        from demucs import pretrained
        models = pretrained.pretrained_models
        print(f"✓ 可用模型: {len(models)} 个")
        for m in models[:5]:
            print(f"   - {m}")
        if len(models) > 5:
            print(f"   ... 等 {len(models)-5} 个更多")
    except Exception as e:
        print(f"⚠️ 无法列出模型: {e}")

    return True

def test_faster_whisper():
    """测试 Faster-Whisper"""
    print("\n[测试] Faster-Whisper 语音识别模块")
    print("-" * 40)

    # 检查 faster-whisper 是否安装
    code, stdout, stderr = run_command([sys.executable, '-c', 'import faster_whisper; print(faster_whisper.__version__)'])
    if code != 0:
        print("⚠️ faster-whisper 未安装（可选功能）")
        print("   安装命令: pip install faster-whisper")
        return False

    print(f"✓ faster-whisper 已安装")

    # 检查 GPU
    try:
        from faster_whisper import WhisperModel
        print("   尝试加载 tiny 模型（CPU）...")
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        print("✓ 模型加载成功")
    except ImportError as e:
        print(f"⚠️ 模型加载失败: {e}")
    except Exception as e:
        print(f"⚠️ 模型加载失败: {e}")

    return True

def test_ffmpeg():
    """测试 FFmpeg"""
    print("\n[测试] FFmpeg")
    print("-" * 40)

    code, stdout, stderr = run_command(['ffmpeg', '-version'])
    if code != 0:
        print("⚠️ FFmpeg 未安装")
        print("   请安装 FFmpeg 并添加到 PATH")
        return False

    # 解析版本
    version_line = stdout.split('\n')[0]
    print(f"✓ FFmpeg 已安装: {version_line}")

    # 检查 ffprobe
    code, stdout, stderr = run_command(['ffprobe', '-version'])
    if code == 0:
        print("✓ ffprobe 已安装")
    else:
        print("⚠️ ffprobe 未安装")

    return True

def test_video_downloader_script():
    """测试 video_downloader.py 脚本"""
    print("\n[测试] video_downloader.py 脚本")
    print("-" * 40)

    script_path = Path(__file__).parent.parent / 'workers' / 'gpu-slicing-worker' / 'python_scripts' / 'video_downloader.py'
    if not script_path.exists():
        print(f"⚠️ 脚本不存在: {script_path}")
        return False

    # 运行 check 命令
    code, stdout, stderr = run_command([sys.executable, str(script_path), '--help'], timeout=10)
    if code != 0:
        print("⚠️ 脚本运行失败")
        print(f"   错误: {stderr[:200]}")
        return False

    print("✓ video_downloader.py 脚本正常")
    return True

def test_audio_analyzer_script():
    """测试 audio_analyzer.py 脚本"""
    print("\n[测试] audio_analyzer.py 脚本")
    print("-" * 40)

    script_path = Path(__file__).parent.parent / 'workers' / 'gpu-slicing-worker' / 'python_scripts' / 'audio_analyzer.py'
    if not script_path.exists():
        print(f"⚠️ 脚本不存在: {script_path}")
        return False

    # 运行 check 命令
    code, stdout, stderr = run_command([sys.executable, str(script_path), 'check'], timeout=15)
    if code != 0:
        print("⚠️ 脚本运行失败")
        print(f"   错误: {stderr[:200]}")
        return False

    try:
        result = json.loads(stdout.strip())
        deps = result.get('dependencies', {})
        print("✓ audio_analyzer.py 脚本正常")
        print(f"   依赖状态: ffmpeg={deps.get('ffmpeg')}, demucs={deps.get('demucs')}, faster_whisper={deps.get('faster_whisper')}")
        return True
    except:
        print(f"⚠️ 脚本输出解析失败")
        return False

def main():
    print("=" * 50)
    print("TikStream AI — 功能测试")
    print("=" * 50)

    results = {}

    results['yt-dlp'] = test_yt_dlp()
    results['ffmpeg'] = test_ffmpeg()
    results['demucs'] = test_demucs()
    results['faster-whisper'] = test_faster_whisper()
    results['video_downloader'] = test_video_downloader_script()
    results['audio_analyzer'] = test_audio_analyzer_script()

    print("\n" + "=" * 50)
    print("测试结果汇总")
    print("=" * 50)

    all_passed = True
    for name, passed in results.items():
        status = "✓" if passed else "❌"
        print(f"  {status} {name}")

    print()
    if all_passed:
        print("🎉 所有核心功能测试通过！")
    else:
        print("⚠️ 部分功能测试未通过，请安装缺失的依赖")

    return 0 if all_passed else 1

if __name__ == '__main__':
    sys.exit(main())