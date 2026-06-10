#!/usr/bin/env python3
"""
TikStream AI — fast scene boundary detection.

Uses FFmpeg's scdet filter and frame metadata extraction. This avoids the RTX 5080
(sm_120) / PyTorch CUDA kernel incompatibility while keeping detection fast.
"""
import json
import os
import signal
import subprocess
import sys
import time
from typing import Any


def _segfault_handler(signum: int, frame: Any) -> None:
    print(json.dumps({
        "success": False,
        "predictions": [],
        "error": f"Process crashed with signal {signum}",
        "video_duration": 0,
        "frame_count": 0,
    }))
    sys.stdout.flush()
    sys.exit(1)


try:
    signal.signal(signal.SIGSEGV, _segfault_handler)
    signal.signal(signal.SIGABRT, _segfault_handler)
except (ValueError, OSError):
    pass


def parse_rate(rate: str) -> float:
    if not rate:
        return 30.0
    if "/" not in rate:
        value = float(rate)
        return value if value > 0 else 30.0
    numerator, denominator = rate.split("/", 1)
    den = float(denominator)
    if den == 0:
        return 30.0
    value = float(numerator) / den
    return value if value > 0 else 30.0


def get_video_info(video_path: str) -> dict[str, float | int]:
    result = subprocess.run([
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        video_path,
    ], capture_output=True, text=True, timeout=30)

    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[-500:]}")

    data = json.loads(result.stdout)
    video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None)
    if not video:
        raise RuntimeError("No video stream found")

    fps = parse_rate(video.get("avg_frame_rate") or video.get("r_frame_rate") or "30/1")
    duration = float(video.get("duration") or data.get("format", {}).get("duration") or 0)
    nb_frames = video.get("nb_frames")
    frame_count = int(nb_frames) if nb_frames and str(nb_frames).isdigit() else int(round(duration * fps))

    return {
        "fps": fps,
        "duration": duration,
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "frame_count": frame_count,
    }


def parse_scdet_metadata(lines: list[str]) -> list[dict[str, float | int]]:
    frames: list[dict[str, float | int]] = []
    current: dict[str, float | int] = {}

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("frame:"):
            if "frame" in current:
                frames.append(current.copy())
            current = {}
            for part in line.split():
                if ":" not in part:
                    continue
                key, value = part.split(":", 1)
                if key == "frame":
                    current["frame"] = int(value)
                elif key == "pts_time":
                    current["pts_time"] = float(value)
            continue

        if line.startswith("lavfi.scd.") and "=" in line:
            key, value = line.split("=", 1)
            current[key.replace("lavfi.scd.", "")] = float(value)

    if "frame" in current:
        frames.append(current)

    return frames


def detect_scenes_scdet(
    video_path: str,
    info: dict[str, float | int],
    threshold: float = 1.2,
    min_scene_len_frames: int = 15,
) -> list[dict[str, Any]]:
    tmp_file = f"/tmp/scdet_meta_{os.getpid()}.txt"
    try:
        timeout_sec = max(300, int(float(info["duration"]) * 2))
        result = subprocess.run([
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-i", video_path,
            "-vf", f"scdet=threshold=1.0,metadata=mode=print:file={tmp_file}",
            "-f", "null",
            "-",
        ], capture_output=True, text=True, timeout=timeout_sec)

        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg scdet failed: {result.stderr[-500:]}")

        with open(tmp_file, "r", encoding="utf-8") as file:
            frames = parse_scdet_metadata(file.readlines())

        if not frames:
            return []

        mafd_values = [float(frame.get("mafd", 0)) for frame in frames]
        sorted_mafds = sorted(mafd_values)
        p90_index = min(len(sorted_mafds) - 1, int(len(sorted_mafds) * 0.90))
        effective_threshold = max(threshold, sorted_mafds[p90_index] + 0.15)

        fps = float(info["fps"])
        min_gap = min_scene_len_frames / fps if fps > 0 else 0.5

        boundaries: list[dict[str, Any]] = []
        prev_time = -999.0
        for frame in frames:
            pts_time = float(frame.get("pts_time", 0))
            mafd = float(frame.get("mafd", 0))
            score = float(frame.get("score", 0))

            if mafd >= effective_threshold and (pts_time - prev_time) > min_gap:
                boundaries.append({
                    "timestamp_sec": round(pts_time, 2),
                    "confidence": round(min(max(score / 50.0, mafd / 100.0), 1.0), 4),
                    "mafd": round(mafd, 2),
                })
                prev_time = pts_time

        return boundaries
    finally:
        if os.path.exists(tmp_file):
            os.remove(tmp_file)


def categorize_error(message: str) -> str:
    lower = message.lower()
    if 'ffprobe' in lower or 'no video stream' in lower:
        return 'ffprobe'
    if 'scdet' in lower or 'ffmpeg' in lower:
        return 'scdet'
    if 'timeout' in lower or 'timed out' in lower:
        return 'timeout'
    return 'unknown'


def error_payload(message: str, **extra: Any) -> dict[str, Any]:
    return {
        'success': False,
        'predictions': [],
        'error': message,
        'error_category': categorize_error(message),
        'video_duration': 0,
        'frame_count': 0,
        'detector': 'ffmpeg-scdet',
        **extra,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps(error_payload('Usage: scene_detector.py <video_path> [threshold]')))
        sys.exit(2)

    video_path = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 1.2

    if not os.path.isfile(video_path):
        print(json.dumps(error_payload(f'File not found: {video_path}')))
        sys.exit(1)

    start_time = time.time()

    try:
        info = get_video_info(video_path)
        duration = float(info["duration"])
        frame_count = int(info["frame_count"])
        fps = float(info["fps"])

        if duration <= 0 or frame_count <= 0:
            print(json.dumps(error_payload(
                f'Invalid video: duration={duration}s, frames={frame_count}',
                video_duration=duration,
                frame_count=frame_count,
            )))
            sys.exit(0)

        boundaries = [] if duration < 2.0 else detect_scenes_scdet(video_path, info, threshold=threshold)
        elapsed = time.time() - start_time

        print(json.dumps({
            "success": True,
            "predictions": boundaries,
            "video_duration": round(duration, 2),
            "frame_count": frame_count,
            "fps": round(fps, 2),
            "boundary_count": len(boundaries),
            "elapsed_sec": round(elapsed, 4),
            "detector": "ffmpeg-scdet",
        }))
    except Exception as error:
        print(json.dumps(error_payload(str(error))))
        sys.exit(1)


if __name__ == "__main__":
    main()
