#!/usr/bin/env python3
"""
TikStream AI — Video Normalizer / Transcoder
=============================================
将非 H.264 格式的视频转码为 H.264 + AAC 的 MP4 容器，
确保切片与渲染管线的兼容性。

依赖: FFmpeg (系统路径)
输入: 任意格式的视频文件
输出: H.264 MP4 文件

用法:
  python video_normalizer.py <input_path> <output_path> [--crf 23] [--preset fast]
"""

import argparse
import json
import os
import subprocess
import sys


def get_video_codec(input_path: str) -> str:
    """使用 ffprobe 检测视频编码格式"""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name",
        "-of", "csv=p=0",
        input_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.stdout.strip().lower()
    except Exception:
        return "unknown"


def get_audio_codec(input_path: str) -> str:
    """使用 ffprobe 检测音频编码格式"""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name",
        "-of", "csv=p=0",
        input_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.stdout.strip().lower() or "none"
    except Exception:
        return "none"


def normalize_video(
    input_path: str,
    output_path: str,
    crf: int = 23,
    preset: str = "fast",
    target_codec: str = "libx264",
    force: bool = False,
) -> dict:
    """
    将视频转码为 H.264 MP4 格式。

    Args:
        input_path: 输入视频路径
        output_path: 输出视频路径
        crf: 质量参数 (0-51, 越小质量越高, 默认23)
        preset: 编码速度预设 (ultrafast/fast/medium/slow, 默认fast)
        target_codec: 目标编码器 (默认 libx264)
        force: 是否强制转码（即使已是 H.264）

    Returns:
        dict: {"success": bool, "output_path": str, "original_codec": str, "target_codec": str, "file_size_bytes": int, "error": str | None}
    """
    result = {
        "success": False,
        "output_path": os.path.abspath(output_path),
        "original_video_codec": "unknown",
        "original_audio_codec": "none",
        "target_codec": target_codec,
        "file_size_bytes": 0,
        "error": None,
        "transcoded": False,
    }

    if not os.path.isfile(input_path):
        result["error"] = f"Input video not found: {input_path}"
        return result

    # 检测原始编码
    original_codec = get_video_codec(input_path)
    original_audio = get_audio_codec(input_path)
    result["original_video_codec"] = original_codec
    result["original_audio_codec"] = original_audio

    # 判断是否需要转码
    h264_codecs = {"h264", "avc", "avc1"}
    needs_transcode = force or (original_codec not in h264_codecs)

    if not needs_transcode and original_audio in {"aac", "none"}:
        # 已是 H.264 + AAC, 直接复制
        result["success"] = True
        result["file_size_bytes"] = os.path.getsize(input_path)
        result["transcoded"] = False
        return result

    # 创建输出目录
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # 构建 FFmpeg 命令
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", input_path,
        "-c:v", target_codec,
        "-preset", preset,
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 分钟超时
        )

        if proc.returncode != 0:
            result["error"] = f"FFmpeg transcode failed (exit={proc.returncode}): {proc.stderr[:500]}"
            return result

        if not os.path.isfile(output_path) or os.path.getsize(output_path) == 0:
            result["error"] = "Transcode completed but output file is empty"
            return result

        result["success"] = True
        result["file_size_bytes"] = os.path.getsize(output_path)
        result["transcoded"] = True

    except FileNotFoundError:
        result["error"] = "FFmpeg not found in system PATH"
    except subprocess.TimeoutExpired:
        result["error"] = "FFmpeg transcode timed out (600s)"
    except Exception as e:
        result["error"] = f"Transcode error: {str(e)}"

    return result


def main():
    parser = argparse.ArgumentParser(description="TikStream Video Normalizer — Transcode to H.264 MP4")
    parser.add_argument("input_path", help="Path to input video file")
    parser.add_argument("output_path", help="Path for normalized output MP4")
    parser.add_argument("--crf", type=int, default=23, help="CRF quality (0-51, default: 23)")
    parser.add_argument("--preset", default="fast", help="FFmpeg preset (default: fast)")
    parser.add_argument("--force", action="store_true", help="Force transcode even if already H.264")
    args = parser.parse_args()

    result = normalize_video(
        args.input_path,
        args.output_path,
        crf=args.crf,
        preset=args.preset,
        force=args.force,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
