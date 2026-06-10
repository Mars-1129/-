"""
Speech-driven video slicer — VAD + Whisper ASR.
用于 AutoCut 语音驱动智能剪辑管道。

用法: python3 speech_slicer.py <video_path>
输出: JSON 一行 — { "success": bool, "segments": [...], "srt_content": "...", "language": "..." }

降级: 任何异常捕获后返回 success=false + 空 segments，不抛异常。
依赖: torch, torchaudio, faster-whisper (已在 Dockerfile 中安装)
      silero-vad (通过 torch.hub.load 自动拉取)
"""

import json
import os
import subprocess
import sys
import tempfile
import time


def extract_audio_16k(video_path: str) -> str:
    """FFmpeg 提取 16kHz mono wav 音频"""
    tmpdir = tempfile.mkdtemp(prefix="tts_speech_")
    wav_path = os.path.join(tmpdir, "audio.wav")
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", video_path,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        wav_path,
    ]
    subprocess.run(cmd, check=True, timeout=60)
    return wav_path


def load_audio(wav_path: str):
    """加载 wav -> torch tensor (1D float32)"""
    import torch
    import torchaudio
    waveform, sr = torchaudio.load(wav_path)
    if sr != 16000:
        resampler = torchaudio.transforms.Resample(sr, 16000)
        waveform = resampler(waveform)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0)
    return waveform.squeeze(0)


def detect_speech(audio) -> list:
    """
    Silero-VAD 语音活动检测。
    后处理 (参考 AutoCut):
      - 移除 < 1.0s 的碎片段
      - 前扩 0.2s (避免切太紧)
      - 合并间隔 < 0.5s 的相邻段
    """
    import torch

    model, utils = torch.hub.load(
        repo_or_dir="snakers4/silero-vad",
        model="silero_vad",
        trust_repo=True,
    )
    (get_speech_timestamps, _, _, _, _) = utils

    sampling_rate = 16000
    speeches = get_speech_timestamps(audio, model, sampling_rate=sampling_rate)

    min_samples = int(1.0 * sampling_rate)
    expand_samples = int(0.2 * sampling_rate)
    merge_samples = int(0.5 * sampling_rate)

    # 1) 移除过短片段
    speeches = [s for s in speeches if s["end"] - s["start"] > min_samples]

    # 2) 边界扩展
    for s in speeches:
        s["start"] = max(0, s["start"] - expand_samples)
        s["end"] = min(len(audio), s["end"] + expand_samples)

    # 3) 合并相邻段
    if speeches:
        merged = [speeches[0]]
        for cur in speeches[1:]:
            prev = merged[-1]
            if cur["start"] - prev["end"] < merge_samples:
                prev["end"] = cur["end"]
            else:
                merged.append(cur)
        speeches = merged

    result = []
    for s in speeches:
        result.append({
            "start_sec": round(s["start"] / sampling_rate, 3),
            "end_sec": round(s["end"] / sampling_rate, 3),
            "confidence": 0.9,
        })
    return result


def transcribe_with_whisper(wav_path: str, speeches: list) -> list:
    """
    Faster-Whisper 转录，返回词级文本。
    默认 tiny 模型 (快，~70MB，CPU 可用)。
    """
    from faster_whisper import WhisperModel

    model_size = os.environ.get("WHISPER_MODEL_SIZE", "tiny")
    device = os.environ.get("WHISPER_DEVICE", "auto")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    # 整段转录，不做分片 (利用 Whisper 内置 VAD)
    segments, info = model.transcribe(
        wav_path,
        language=None,
        vad_filter=True,
        word_timestamps=False,
        condition_on_previous_text=False,
    )

    # 将转录段与 VAD 语音段做交叉匹配
    result_segments = []
    for seg in segments:
        seg_start = seg.start
        seg_end = seg.end
        seg_text = seg.text.strip()
        if not seg_text:
            continue
        # 检查是否落在任一语音段范围内
        matched = False
        for sp in speeches:
            if seg_end >= sp["start_sec"] and seg_start <= sp["end_sec"]:
                matched = True
                break
        if matched:
            result_segments.append({
                "start_sec": round(seg_start, 3),
                "end_sec": round(seg_end, 3),
                "text": seg_text,
                "confidence": round(seg.avg_logprob, 3) if seg.avg_logprob else 0,
            })

    return result_segments


def generate_srt(segments: list) -> str:
    """生成 SRT 格式字幕"""
    lines = []
    for i, seg in enumerate(segments, 1):
        start = _format_srt_time(seg["start_sec"])
        end = _format_srt_time(seg["end_sec"])
        lines.append(str(i))
        lines.append(f"{start} --> {end}")
        lines.append(seg["text"])
        lines.append("")
    return "\n".join(lines)


def _format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "segments": [],
            "srt_content": "",
            "language": "unknown",
            "error": "missing video path argument",
        }, ensure_ascii=False))
        sys.exit(0)

    video_path = sys.argv[1]

    if not os.path.isfile(video_path):
        print(json.dumps({
            "success": False,
            "segments": [],
            "srt_content": "",
            "language": "unknown",
            "error": f"video not found: {video_path}",
        }, ensure_ascii=False))
        sys.exit(0)

    t0 = time.time()

    try:
        wav_path = extract_audio_16k(video_path)
        audio = load_audio(wav_path)
        speeches = detect_speech(audio)

        output_segments = []
        srt_content = ""
        language = "unknown"

        if speeches:
            output_segments = transcribe_with_whisper(wav_path, speeches)
            if output_segments:
                srt_content = generate_srt(output_segments)

        elapsed = round(time.time() - t0, 1)

        result = {
            "success": True,
            "segments": output_segments,
            "srt_content": srt_content,
            "language": language,
            "elapsed_sec": elapsed,
            "speech_clip_count": len(speeches),
            "transcribed_segment_count": len(output_segments),
        }
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        elapsed = round(time.time() - t0, 1)
        result = {
            "success": False,
            "segments": [],
            "srt_content": "",
            "language": "unknown",
            "elapsed_sec": elapsed,
            "error": str(e),
        }
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
