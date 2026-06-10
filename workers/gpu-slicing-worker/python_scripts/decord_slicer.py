#!/usr/bin/env python3
"""
TikStream AI — GPU-Accelerated Scene Boundary Detection
========================================================
Uses Decord for GPU video frame decoding and TransNetV2 for
shot boundary detection on an RTX 5080.

Input:  Path to source video file
Output: JSON to stdout with scene boundary timestamps
"""
import sys
import json
import gc
import os
import time
import traceback
import signal
from typing import Any

# ── segfault guard ──────────────────────────────────────────────────────────
# Catch SIGSEGV / SIGABRT so we can emit a clean JSON error instead of a raw
# core-dump trace.  Using signal.signal is safe because we only use the default
# SIG_DFL handling as a fallback.
_original_sigsegv = None
_original_sigabrt = None

def _safe_exit(code: int) -> None:
    sys.stdout.flush()
    sys.stderr.flush()
    os.kill(os.getpid(), code)

def _segfault_handler(signum: int, frame) -> None:
    print(json.dumps({
        "success": False,
        "predictions": [],
        "error": f"Process crashed with signal {signum} (likely CUDA incompatibility). Falling back to CPU-only inference.",
        "video_duration": 0,
        "frame_count": 0,
    }), file=sys.stdout)
    sys.stdout.flush()
    sys.exit(1)

try:
    _original_sigsegv = signal.signal(signal.SIGSEGV, _segfault_handler)
    _original_sigabrt = signal.signal(signal.SIGABRT, _segfault_handler)
except (ValueError, OSError):
    pass  # signal handling not available on this platform

def check_dependencies() -> None:
    missing: list[str] = []
    try:
        import decord
    except ImportError:
        missing.append("decord")
    try:
        import transnetv2_pytorch as transnetv2
    except ImportError:
        missing.append("transnetv2-pytorch")
    if missing:
        print(json.dumps({
            "success": False,
            "predictions": [],
            "error": f"Missing dependencies: {', '.join(missing)}. Run: pip install {' '.join(missing)}",
            "video_duration": 0,
            "frame_count": 0,
        }))
        sys.exit(1)

check_dependencies()

import torch
import numpy as np
from decord import VideoReader, cpu
from transnetv2_pytorch import TransNetV2


def free_gpu_memory() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def load_model(device: torch.device) -> TransNetV2:
    if device.type == 'cuda':
        try:
            model = TransNetV2(device='cuda')
            state_dict = torch.load(
                TransNetV2.get_model_path(),
                map_location=device,
                weights_only=True,
            )
            model.load_state_dict(state_dict)
            model.to(device)
            model.eval()
            return model
        except RuntimeError as e:
            if 'CUDA' not in str(e) and 'kernel' not in str(e).lower():
                raise

    model = TransNetV2(device='cpu')
    state_dict = torch.load(
        TransNetV2.get_model_path(),
        map_location='cpu',
        weights_only=True,
    )
    model.load_state_dict(state_dict)
    model.eval()
    return model


def open_video(video_path: str) -> tuple[VideoReader, int, float, float]:
    try:
        vr = VideoReader(video_path, ctx=cpu(0))
    except Exception as e:
        raise RuntimeError(f"Decord VideoReader failed: {e}") from e

    frame_count = len(vr)
    fps: float = float(vr.get_avg_fps())
    if fps <= 0:
        fps = 30.0

    duration = frame_count / fps
    return vr, frame_count, duration, fps


def sample_frames_at_fps(vr: VideoReader, frame_count: int, fps: float, target_fps: float = 15.0) -> np.ndarray:
    if fps <= target_fps or frame_count <= 100:
        indices = list(range(frame_count))
    else:
        step = int(fps / target_fps)
        indices = list(range(0, frame_count, max(step, 1)))

    frames_tensor = vr.get_batch(indices)
    frames = frames_tensor.asnumpy()
    return frames


def detect_boundaries(
    model: TransNetV2,
    video_path: str,
    confidence_threshold: float = 0.45,
) -> tuple[list[dict[str, Any]], float, int]:
    analysis = model.analyze_video(video_path, threshold=confidence_threshold, quiet=True)
    fps = float(analysis.get("fps") or 30.0)
    video_frames = analysis.get("video_frames")
    frame_count = int(video_frames.shape[0]) if video_frames is not None else 0

    boundaries: list[dict[str, Any]] = []
    for scene in analysis.get("scenes", []):
        start = float(scene.get("start_time_seconds", 0.0))
        confidence = float(scene.get("confidence", 0.5))
        if start > 0.5:
            boundaries.append({
                "timestamp_sec": round(start, 2),
                "confidence": round(confidence, 4),
            })

    return boundaries, fps, frame_count


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "predictions": [],
            "error": "Usage: decord_slicer.py <video_path>",
            "video_duration": 0,
            "frame_count": 0,
        }))
        sys.exit(2)

    video_path = sys.argv[1]

    if not os.path.isfile(video_path):
        print(json.dumps({
            "success": False,
            "predictions": [],
            "error": f"File not found: {video_path}",
            "video_duration": 0,
            "frame_count": 0,
        }))
        sys.exit(1)

    start_time = time.time()

    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        if device.type == "cuda":
            try:
                torch.cuda.init()
                vram_info = torch.cuda.mem_get_info()
                vram_free_mb = vram_info[0] / (1024 * 1024)
                vram_total_mb = vram_info[1] / (1024 * 1024)
                if vram_free_mb < 1024:
                    print(json.dumps({
                        "success": False,
                        "predictions": [],
                        "error": f"Insufficient VRAM: {vram_free_mb:.0f}MB free of {vram_total_mb:.0f}MB (need >= 1024MB)",
                        "video_duration": 0,
                        "frame_count": 0,
                    }))
                    sys.exit(1)
            except RuntimeError as cuda_err:
                device = torch.device("cpu")
                print(json.dumps({
                    "success": False,
                    "predictions": [],
                    "error": f"CUDA unavailable/incompatible ({cuda_err}), falling back to CPU inference",
                    "video_duration": 0,
                    "frame_count": 0,
                }), file=sys.stderr)
                sys.stderr.flush()

        vr, frame_count, duration, fps = open_video(video_path)

        if duration <= 0 or frame_count <= 0:
            print(json.dumps({
                "success": False,
                "predictions": [],
                "error": f"Invalid video: duration={duration}s, frames={frame_count}",
                "video_duration": duration,
                "frame_count": frame_count,
            }))
            sys.exit(0)

        if duration < 2.0:
            print(json.dumps({
                "success": True,
                "predictions": [],
                "video_duration": duration,
                "frame_count": frame_count,
            }))
            sys.exit(0)

        del vr
        model = load_model(device)
        boundaries, detected_fps, detected_frame_count = detect_boundaries(model, video_path)

        del model
        free_gpu_memory()

        elapsed = time.time() - start_time

        output = {
            "success": True,
            "predictions": boundaries,
            "video_duration": round(duration, 2),
            "frame_count": detected_frame_count or frame_count,
            "fps": round(detected_fps or fps, 2),
            "boundary_count": len(boundaries),
            "elapsed_sec": round(elapsed, 2),
        }

        print(json.dumps(output))

    except Exception as e:
        error_msg = str(e)
        if "CUDA out of memory" in error_msg or "CUDA error" in error_msg or "out of memory" in error_msg.lower():
            error_category = "CUDA_OOM"
        elif "VideoReader" in error_msg or "decode" in error_msg.lower():
            error_category = "DECODE_ERROR"
        else:
            error_category = "UNKNOWN_ERROR"

        print(json.dumps({
            "success": False,
            "predictions": [],
            "error": f"[{error_category}] {error_msg}",
            "video_duration": 0,
            "frame_count": 0,
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
