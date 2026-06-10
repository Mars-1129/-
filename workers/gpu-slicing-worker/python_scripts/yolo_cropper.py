#!/usr/bin/env python3
"""
YOLOv11 9:16 自适应裁切脚本
检测视频中的主体/焦点，自动裁切为 9:16 竖版

Usage:
    python yolo_cropper.py <video_path> <output_dir> [--model MODEL_PATH] [--target-ratio RATIO]
"""

import sys
import json
import argparse
import subprocess
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
import tempfile
import os

# 尝试导入 ultralytics，如果不可用则跳过 YOLO 检测
try:
    from ultralytics import YOLO
    import cv2
    import numpy as np
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[Warning] ultralytics/cv2 not available, using fallback cropping", file=sys.stderr)


def parse_args():
    parser = argparse.ArgumentParser(description='YOLOv11 9:16 adaptive cropping')
    parser.add_argument('video_path', help='Path to input video')
    parser.add_argument('output_dir', help='Directory for output files')
    parser.add_argument('--model', default='yolov8n.pt', help='YOLO model path (default: yolov8n.pt)')
    parser.add_argument('--target-ratio', type=float, default=9/16, help='Target aspect ratio (default: 9/16)')
    parser.add_argument('--sample-interval', type=int, default=30, help='Frame sampling interval (default: 30)')
    parser.add_argument('--min-confidence', type=float, default=0.3, help='Minimum confidence threshold (default: 0.3)')
    parser.add_argument('--check', action='store_true', help='Check dependencies only')
    return parser.parse_args()


def check_dependencies() -> Dict[str, bool]:
    """检查依赖是否可用"""
    result = {
        'python': True,
        'ffmpeg': False,
        'ffprobe': False,
        'ultralytics': YOLO_AVAILABLE,
        'cv2': YOLO_AVAILABLE,
        'numpy': YOLO_AVAILABLE,
    }

    # 检查 ffmpeg
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        result['ffmpeg'] = True
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 检查 ffprobe
    try:
        subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
        result['ffprobe'] = True
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return result


def get_video_info(video_path: str) -> Optional[Dict[str, Any]]:
    """使用 ffprobe 获取视频信息"""
    try:
        cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)

        video_stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
        if not video_stream:
            return None

        return {
            'width': int(video_stream.get('width', 0)),
            'height': int(video_stream.get('height', 0)),
            'duration': float(data.get('format', {}).get('duration', 0)),
            'fps': eval(video_stream.get('r_frame_rate', '0/1')),
        }
    except Exception as e:
        print(f"[Error] Failed to get video info: {e}", file=sys.stderr)
        return None


def detect_main_subject_yolo(video_path: str, model_path: str, sample_interval: int = 30,
                             min_confidence: float = 0.3) -> List[Dict[str, Any]]:
    """使用 YOLOv11 检测视频中的主体"""
    if not YOLO_AVAILABLE:
        print("[Warning] YOLO not available, using center-based cropping", file=sys.stderr)
        return []

    detections = []
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"[Error] Cannot open video: {video_path}", file=sys.stderr)
        return []

    # 加载模型
    try:
        model = YOLO(model_path)
        print(f"[YOLO] Model loaded: {model_path}", file=sys.stderr)
    except Exception as e:
        print(f"[Error] Failed to load model: {e}", file=sys.stderr)
        cap.release()
        return []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 只处理采样间隔的帧
        if frame_idx % sample_interval != 0:
            frame_idx += 1
            continue

        try:
            results = model(frame, conf=min_confidence, verbose=False)
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0].cpu())
                    cls = int(box.cls[0].cpu())

                    detections.append({
                        'frame': frame_idx,
                        'x1': float(x1), 'y1': float(y1),
                        'x2': float(x2), 'y2': float(y2),
                        'confidence': conf,
                        'class': cls,
                        'center_x': (float(x1) + float(x2)) / 2,
                        'center_y': (float(y1) + float(y2)) / 2,
                        'width': float(x2) - float(x1),
                        'height': float(y2) - float(y1),
                    })
        except Exception as e:
            print(f"[Warning] Detection failed at frame {frame_idx}: {e}", file=sys.stderr)

        frame_idx += 1

    cap.release()
    print(f"[YOLO] Detected {len(detections)} objects in {frame_idx} frames", file=sys.stderr)
    return detections


def compute_optimal_crop(detections: List[Dict], video_width: int, video_height: int,
                         target_ratio: float = 9/16) -> Tuple[int, int, int, int]:
    """
    计算最优裁切区域

    Returns:
        (x, y, width, height) - 裁切区域
    """
    if not detections:
        # 无检测结果，使用中心裁切
        print("[Crop] No detections, using center crop")
        return compute_center_crop(video_width, video_height, target_ratio)

    # 计算加权中心（基于置信度和出现频率）
    weights = {}
    for det in detections:
        frame = det['frame']
        if frame not in weights:
            weights[frame] = {'sum_x': 0, 'sum_y': 0, 'count': 0, 'confidence': 0}
        weights[frame]['sum_x'] += det['center_x']
        weights[frame]['sum_y'] += det['center_y']
        weights[frame]['count'] += 1
        weights[frame]['confidence'] += det['confidence']

    # 选择出现最频繁的检测区域作为焦点
    best_frame = max(weights.keys(), key=lambda f: weights[f]['count'] * weights[f]['confidence'])
    center_x = weights[best_frame]['sum_x'] / weights[best_frame]['count']
    center_y = weights[best_frame]['sum_y'] / weights[best_frame]['count']

    # 计算目标裁切尺寸
    # 目标高度 = 视频高度（保持不变）
    target_height = video_height
    target_width = int(target_height * target_ratio)

    # 确保裁切区域不超出边界
    x = max(0, min(video_width - target_width, int(center_x - target_width / 2)))
    y = 0  # 竖版从顶部开始

    # 如果裁切区域超出右边界，左移
    if x + target_width > video_width:
        x = max(0, video_width - target_width)

    return (x, y, target_width, target_height)


def compute_center_crop(video_width: int, video_height: int, target_ratio: float = 9/16) -> Tuple[int, int, int, int]:
    """
    计算中心裁切区域（无 YOLO 时的兜底方案）

    Returns:
        (x, y, width, height)
    """
    target_height = video_height
    target_width = int(target_height * target_ratio)
    x = max(0, (video_width - target_width) // 2)
    y = 0
    return (x, y, target_width, target_height)


def apply_crop_ffmpeg(video_path: str, output_path: str, crop_region: Tuple[int, int, int, int]) -> bool:
    """
    使用 FFmpeg 应用裁切并缩放到目标分辨率

    Args:
        video_path: 输入视频路径
        output_path: 输出视频路径
        crop_region: (x, y, width, height)

    Returns:
        True if successful
    """
    x, y, crop_w, crop_h = crop_region

    # 目标分辨率 (9:16 竖版)
    target_width = 1080
    target_height = 1920

    cmd = [
        'ffmpeg', '-y', '-i', video_path,
        '-vf', f'crop={crop_w}:{crop_h}:{x}:{y},scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode == 0:
            print(f"[FFmpeg] Cropped video saved: {output_path}")
            return True
        else:
            print(f"[FFmpeg] Error: {result.stderr}", file=sys.stderr)
            return False
    except subprocess.TimeoutExpired:
        print("[FFmpeg] Timeout during cropping", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[FFmpeg] Exception: {e}", file=sys.stderr)
        return False


def main():
    args = parse_args()

    # 检查依赖
    if args.check:
        deps = check_dependencies()
        print(json.dumps(deps, indent=2))
        return 0

    video_path = args.video_path
    output_dir = args.output_dir

    # 验证输入文件
    if not os.path.exists(video_path):
        print(f"[Error] Video file not found: {video_path}", file=sys.stderr)
        return 1

    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 获取视频信息
    video_info = get_video_info(video_path)
    if not video_info:
        print("[Error] Failed to get video info", file=sys.stderr)
        return 1

    print(f"[Video] {video_info['width']}x{video_info['height']}, {video_info['duration']:.1f}s, {video_info['fps']:.2f}fps", file=sys.stderr)

    # 检测主体
    detections = []
    if YOLO_AVAILABLE and os.path.exists(args.model):
        detections = detect_main_subject_yolo(
            video_path,
            args.model,
            sample_interval=args.sample_interval,
            min_confidence=args.min_confidence
        )
    else:
        print(f"[YOLO] Model not available at {args.model}, using center crop")

    # 计算最优裁切区域
    crop_region = compute_optimal_crop(
        detections,
        video_info['width'],
        video_info['height'],
        target_ratio=args.target_ratio
    )

    print(f"[Crop] Region: x={crop_region[0]}, y={crop_region[1]}, w={crop_region[2]}, h={crop_region[3]}", file=sys.stderr)

    # 生成输出文件名
    output_filename = f"cropped_{os.path.basename(video_path)}"
    output_path = os.path.join(output_dir, output_filename)

    # 应用裁切
    success = apply_crop_ffmpeg(video_path, output_path, crop_region)

    # 输出结果
    result = {
        'success': success,
        'input': {
            'path': video_path,
            'width': video_info['width'],
            'height': video_info['height'],
        },
        'output': {
            'path': output_path if success else None,
            'width': 1080,
            'height': 1920,
        },
        'crop_region': {
            'x': crop_region[0],
            'y': crop_region[1],
            'width': crop_region[2],
            'height': crop_region[3],
        },
        'detection_count': len(detections),
    }

    print(json.dumps(result))
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
