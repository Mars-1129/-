#!/usr/bin/env python3
# =============================================================================
# TikStream AI — Video Downloader (yt-dlp)
# =============================================================================
# 支持下载 TikTok 和抖音视频，获取无水印视频和元数据
# =============================================================================

import sys
import json
import subprocess
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict


@dataclass
class VideoMetadata:
    """视频元数据"""
    video_id: str
    title: str
    description: str
    uploader: str
    uploader_id: str
    duration: float
    view_count: int
    like_count: int
    comment_count: int
    share_count: int
    upload_date: str
    tags: list
    thumbnail_url: str
    url: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


@dataclass
class DownloadResult:
    """下载结果"""
    success: bool
    metadata: Optional[VideoMetadata] = None
    error: Optional[str] = None
    output_path: Optional[str] = None


def is_tiktok_url(url: str) -> bool:
    """判断是否为 TikTok URL"""
    return 'tiktok.com' in url.lower()


def is_douyin_url(url: str) -> bool:
    """判断是否为抖音 URL"""
    return 'douyin.com' in url.lower() or 'v.douyin.com' in url.lower()


def get_video_info(url: str, output_dir: str) -> DownloadResult:
    """
    获取视频信息（不下载）
    """
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '--dump-json',
                '--no-download',
                '--no-warnings',
                '--quiet',
                url
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=True
        )

        info = json.loads(result.stdout.strip())

        metadata = VideoMetadata(
            video_id=info.get('id', ''),
            title=info.get('title', ''),
            description=info.get('description', ''),
            uploader=info.get('uploader', ''),
            uploader_id=info.get('uploader_id', ''),
            duration=info.get('duration', 0),
            view_count=info.get('view_count', 0),
            like_count=info.get('like_count', 0),
            comment_count=info.get('comment_count', 0),
            share_count=info.get('share_count', 0),
            upload_date=info.get('upload_date', ''),
            tags=info.get('tags', []),
            thumbnail_url=info.get('thumbnail', ''),
            url=url,
            width=info.get('width'),
            height=info.get('height'),
        )

        return DownloadResult(
            success=True,
            metadata=metadata
        )

    except subprocess.TimeoutExpired:
        return DownloadResult(
            success=False,
            error="Download timeout - video may be unavailable or region-blocked"
        )
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr or str(e)
        if 'Signage' in error_msg or 'age' in error_msg:
            return DownloadResult(
                success=False,
                error="Video requires authentication or is age-restricted"
            )
        return DownloadResult(
            success=False,
            error=f"yt-dlp failed: {error_msg}"
        )
    except json.JSONDecodeError:
        return DownloadResult(
            success=False,
            error="Failed to parse video info from yt-dlp output"
        )
    except Exception as e:
        return DownloadResult(
            success=False,
            error=f"Unexpected error: {str(e)}"
        )


def download_video(url: str, output_dir: str) -> DownloadResult:
    """
    下载视频（无水印）
    """
    try:
        # 确保输出目录存在
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # 使用yt-dlp下载，输出模板
        output_template = str(Path(output_dir) / '%(id)s.%(ext)s')

        result = subprocess.run(
            [
                'yt-dlp',
                '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--output', output_template,
                '--no-warnings',
                '--quiet',
                '--merge-output-format', 'mp4',
                url
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=True
        )

        # 获取视频信息
        info_result = get_video_info(url, output_dir)
        if not info_result.success or not info_result.metadata:
            return info_result

        metadata = info_result.metadata
        video_file = Path(output_dir) / f"{metadata.video_id}.mp4"

        if video_file.exists():
            metadata.file_path = str(video_file)
            metadata.file_size = video_file.stat().st_size

        return DownloadResult(
            success=True,
            metadata=metadata,
            output_path=str(video_file)
        )

    except subprocess.TimeoutExpired:
        return DownloadResult(
            success=False,
            error="Download timeout - video may be too large or network issue"
        )
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr or str(e)
        if 'Signage' in error_msg or 'age' in error_msg:
            return DownloadResult(
                success=False,
                error="Video requires authentication or is age-restricted"
            )
        if 'was not downloaded' in error_msg:
            return DownloadResult(
                success=False,
                error="Video download incomplete - possible network issue"
            )
        return DownloadResult(
            success=False,
            error=f"yt-dlp download failed: {error_msg}"
        )
    except Exception as e:
        return DownloadResult(
            success=False,
            error=f"Unexpected error during download: {str(e)}"
        )


def download_audio_only(url: str, output_dir: str) -> DownloadResult:
    """
    仅下载音频流（用于后续分析）
    """
    try:
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        output_template = str(Path(output_dir) / '%(id)s.%(ext)s')

        result = subprocess.run(
            [
                'yt-dlp',
                '-f', 'bestaudio[ext=m4a]/bestaudio',
                '--output', output_template,
                '--no-warnings',
                '--quiet',
                '--extract-audio',
                '--audio-format', 'wav',
                url
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=True
        )

        info_result = get_video_info(url, output_dir)
        if not info_result.success or not info_result.metadata:
            return info_result

        metadata = info_result.metadata
        audio_file = Path(output_dir) / f"{metadata.video_id}.wav"

        if audio_file.exists():
            metadata.file_path = str(audio_file)
            metadata.file_size = audio_file.stat().st_size

        return DownloadResult(
            success=True,
            metadata=metadata,
            output_path=str(audio_file)
        )

    except subprocess.TimeoutExpired:
        return DownloadResult(
            success=False,
            error="Audio download timeout"
        )
    except subprocess.CalledProcessError as e:
        return DownloadResult(
            success=False,
            error=f"yt-dlp audio download failed: {e.stderr or str(e)}"
        )
    except Exception as e:
        return DownloadResult(
            success=False,
            error=f"Unexpected error during audio download: {str(e)}"
        )


def main():
    """
    命令行入口
    Usage:
        python video_downloader.py download <url> <output_dir>
        python video_downloader.py info <url>
        python video_downloader.py audio <url> <output_dir>
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: video_downloader.py <command> <url> [output_dir]'
        }))
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == 'download':
        if len(sys.argv) < 4:
            print(json.dumps({
                'success': False,
                'error': 'Usage: video_downloader.py download <url> <output_dir>'
            }))
            sys.exit(1)
        url = sys.argv[2]
        output_dir = sys.argv[3]
        result = download_video(url, output_dir)

    elif command == 'info':
        if len(sys.argv) < 3:
            print(json.dumps({
                'success': False,
                'error': 'Usage: video_downloader.py info <url>'
            }))
            sys.exit(1)
        url = sys.argv[2]
        output_dir = '/tmp'
        result = get_video_info(url, output_dir)

    elif command == 'audio':
        if len(sys.argv) < 4:
            print(json.dumps({
                'success': False,
                'error': 'Usage: video_downloader.py audio <url> <output_dir>'
            }))
            sys.exit(1)
        url = sys.argv[2]
        output_dir = sys.argv[3]
        result = download_audio_only(url, output_dir)

    else:
        print(json.dumps({
            'success': False,
            'error': f'Unknown command: {command}'
        }))
        sys.exit(1)

    # 输出结果
    if result.success and result.metadata:
        output = {
            'success': True,
            'metadata': asdict(result.metadata),
            'output_path': result.output_path
        }
    else:
        output = {
            'success': False,
            'error': result.error
        }

    print(json.dumps(output, ensure_ascii=False))


if __name__ == '__main__':
    main()