#!/usr/bin/env python3
"""
TikStream AI — SFX Sound Effect Extractor
==========================================
使用 HTDemucs 将视频音轨分离为 BGM、人声、鼓点等多轨，供素材库复用。

依赖: demucs (pip install demucs)
输入: 视频文件路径
输出: 分离后的音轨 JSON 描述

用法:
  python sfx_extractor.py <video_path> <output_dir> [--model htdemucs]
"""

import argparse
import json
import os
import sys
import traceback


def extract_sfx(input_video_path: str, output_dir: str, model: str = "htdemucs") -> dict:
    """
    使用 HTDemucs 分离音轨。

    Args:
        input_video_path: 输入视频文件路径
        output_dir: 输出目录
        model: 分离模型名称 (默认 htdemucs)

    Returns:
        dict: {
            "success": bool,
            "tracks": {
                "vocals": str | None,
                "drums": str | None,
                "bass": str | None,
                "other": str | None   # 包含 BGM + 音效
            },
            "error": str | None
        }
    """
    result = {
        "success": False,
        "tracks": {
            "vocals": None,
            "drums": None,
            "bass": None,
            "other": None,
        },
        "error": None,
    }

    if not os.path.isfile(input_video_path):
        result["error"] = f"Input video not found: {input_video_path}"
        return result

    os.makedirs(output_dir, exist_ok=True)

    try:
        from demucs import separate

        # HTDemucs 4-stem 分离: vocals, drums, bass, other
        separate.main([
            "--out", output_dir,
            "--name", model,
            "--two-stems", "drums",
            input_video_path,
        ])

        # demucs 输出路径: <output_dir>/<model>/<base_filename>/
        base_name = os.path.splitext(os.path.basename(input_video_path))[0]
        demucs_output = os.path.join(output_dir, model, base_name)

        if os.path.isdir(demucs_output):
            for stem in ["vocals", "drums", "bass", "other"]:
                stem_path = os.path.join(demucs_output, f"{stem}.wav")
                if os.path.isfile(stem_path):
                    result["tracks"][stem] = os.path.abspath(stem_path)

            result["success"] = any(result["tracks"].values())
            if not result["success"]:
                result["error"] = "Demucs completed but no output tracks found"
        else:
            result["error"] = f"Demucs output directory not found: {demucs_output}"

    except ImportError:
        result["error"] = "demucs package not installed. Run: pip install demucs"
    except Exception as e:
        result["error"] = f"SFX extraction failed: {str(e)}"
        traceback.print_exc()

    return result


def main():
    parser = argparse.ArgumentParser(description="TikStream SFX Extractor — HTDemucs audio source separation")
    parser.add_argument("video_path", help="Path to input video file")
    parser.add_argument("output_dir", help="Directory for separated audio tracks")
    parser.add_argument("--model", default="htdemucs", help="Demucs model name (default: htdemucs)")
    args = parser.parse_args()

    result = extract_sfx(args.video_path, args.output_dir, args.model)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
