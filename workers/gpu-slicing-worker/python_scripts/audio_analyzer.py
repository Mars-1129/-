#!/usr/bin/env python3
# =============================================================================
# TikStream AI — Audio Analyzer (HTDemucs + Faster-Whisper)
# =============================================================================
# 支持音频分离、语音识别、字幕提取
# =============================================================================

import sys
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict


@dataclass
class AudioSegment:
    """音频段落"""
    start_sec: float
    end_sec: float
    text: str
    language: Optional[str] = None
    confidence: Optional[float] = None
    word_timestamps: Optional[List[Dict[str, Any]]] = None


@dataclass
class BGMStyle:
    """BGM 风格分析结果"""
    style: str
    tempo: Optional[float] = None
    energy: Optional[str] = None
    mood: Optional[str] = None


@dataclass
class AudioAnalysisResult:
    """音频分析结果"""
    success: bool
    has_vocals: bool
    has_bgm: bool
    transcription: Optional[List[AudioSegment]] = None
    subtitle_lines: Optional[List[str]] = None
    bgm_style: Optional[BGMStyle] = None
    duration: Optional[float] = None
    error: Optional[str] = None
    separated_audio_path: Optional[Dict[str, str]] = None


def get_python_cmd():
    """获取可用的 Python 命令"""
    import sys
    return sys.executable

def check_dependencies() -> Dict[str, bool]:
    """检查依赖是否安装"""
    deps = {}
    python_cmd = get_python_cmd()

    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        deps['ffmpeg'] = True
    except:
        deps['ffmpeg'] = False

    try:
        result = subprocess.run(
            [python_cmd, '-c', 'import demucs'],
            capture_output=True, check=True
        )
        deps['demucs'] = result.returncode == 0
    except:
        deps['demucs'] = False

    try:
        result = subprocess.run(
            [python_cmd, '-c', 'import faster_whisper'],
            capture_output=True, check=True
        )
        deps['faster_whisper'] = result.returncode == 0
    except:
        deps['faster_whisper'] = False

    return deps


def extract_audio_from_video(video_path: str, output_dir: str) -> Optional[str]:
    """从视频提取音频"""
    try:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        audio_path = str(Path(output_dir) / 'audio.wav')

        subprocess.run([
            'ffmpeg', '-y', '-i', video_path,
            '-vn', '-acodec', 'pcm_s16le',
            '-ar', '16000', '-ac', '1',
            audio_path
        ], capture_output=True, check=True, timeout=30)

        if Path(audio_path).exists():
            return audio_path
        return None
    except Exception:
        return None


def separate_audio_demucs(audio_path: str, output_dir: str) -> Optional[Dict[str, str]]:
    """
    使用 HTDemucs 进行音频分离
    返回各音轨路径: { 'vocals': path, 'drums': path, 'bass': path, 'other': path }
    """
    try:
        result = subprocess.run([
            'python3', '-m', 'demucs',
            '--two-stems=vocals',
            '--out', output_dir,
            '--filename', '{track}',
            audio_path
        ], capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            return None

        # 解析输出路径
        model_name = 'htdemucs'
        track_name = Path(audio_path).stem

        base_dir = Path(output_dir) / model_name / track_name

        tracks = {
            'vocals': str(base_dir / 'vocals.wav') if (base_dir / 'vocals.wav').exists() else None,
            'other': str(base_dir / 'other.wav') if (base_dir / 'other.wav').exists() else None,
        }

        return {k: v for k, v in tracks.items() if v}

    except Exception:
        return None


def transcribe_with_whisper(audio_path: str, language: str = 'auto') -> List[AudioSegment]:
    """使用 Faster-Whisper 进行语音识别"""
    try:
        from faster_whisper import WhisperModel

        # 选择模型大小（large 精度最高但资源消耗大）
        # 可选: tiny, base, small, medium, large
        model_size = 'base'

        # 尝试 GPU，如果不可用则回退到 CPU
        try:
            model = WhisperModel(
                model_size,
                device='cuda',
                compute_type='float16'
            )
        except Exception:
            model = WhisperModel(
                model_size,
                device='cpu',
                compute_type='int8'
            )

        # 执行识别（启用词级时间戳用于字幕时间轴对齐）
        segments, info = model.transcribe(
            audio_path,
            language=language if language != 'auto' else None,
            beam_size=5,
            vad_filter=True,  # 启用语音活动检测
            word_timestamps=True,  # 启用词级时间戳（用于精确字幕对齐）
        )

        results = []
        for segment in segments:
            # 构建词级时间戳
            word_timestamps = []
            if hasattr(segment, 'words') and segment.words:
                for word in segment.words:
                    word_timestamps.append({
                        'word': word.word.strip(),
                        'start_sec': round(word.start, 3),
                        'end_sec': round(word.end, 3),
                        'confidence': round(word.probability, 3) if hasattr(word, 'probability') else None,
                    })

            results.append(AudioSegment(
                start_sec=round(segment.start, 3),
                end_sec=round(segment.end, 3),
                text=segment.text.strip(),
                language=info.language if info else None,
                confidence=round(segment.avg_likelihood, 3) if hasattr(segment, 'avg_likelihood') else None,
                word_timestamps=word_timestamps if word_timestamps else None,
            ))

        return results

    except ImportError:
        print(json.dumps({
            'success': False,
            'error': 'faster-whisper not installed. Run: pip install faster-whisper'
        }), file=sys.stderr)
        return []
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Whisper error: {str(e)}'
        }), file=sys.stderr)
        return []


def analyze_bgm_style(separated_tracks: Dict[str, str]) -> Optional[BGMStyle]:
    """
    分析 BGM 风格
    基于音频特征的简单分类（简化版，实际可用 Essentia/MIR 等库）
    """
    if 'other' not in separated_tracks:
        return None

    try:
        # 简化版：使用 ffprobe 获取音频信息
        result = subprocess.run([
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_format', '-show_streams',
            separated_tracks['other']
        ], capture_output=True, text=True, check=True)

        info = json.loads(result.stdout)

        # 简单基于比特率和采样率估算
        format_info = info.get('format', {})
        bitrate = int(format_info.get('bit_rate', 0))

        # 简化分类逻辑
        if bitrate > 192000:
            return BGMStyle(
                style='upbeat_high_energy',
                energy='high',
                mood='energetic'
            )
        elif bitrate > 128000:
            return BGMStyle(
                style='standard_pop',
                energy='medium',
                mood='neutral'
            )
        else:
            return BGMStyle(
                style='minimal_ambient',
                energy='low',
                mood='calm'
            )

    except Exception:
        return None


def analyze_video_audio(video_path: str, output_dir: str) -> AudioAnalysisResult:
    """
    完整音频分析流程
    1. 提取音频
    2. 分离人声和 BGM（可选）
    3. 语音转文字
    4. 字幕提取
    5. BGM 风格分析
    """
    try:
        # 1. 提取音频
        audio_path = extract_audio_from_video(video_path, output_dir)
        if not audio_path:
            return AudioAnalysisResult(
                success=False,
                has_vocals=False,
                has_bgm=False,
                error="Failed to extract audio from video"
            )

        # 2. 获取视频时长
        duration = None
        try:
            result = subprocess.run([
                'ffprobe', '-v', 'quiet',
                '-print_format', 'json',
                '-show_format', video_path
            ], capture_output=True, text=True, check=True)
            info = json.loads(result.stdout)
            duration = float(info.get('format', {}).get('duration', 0))
        except:
            pass

        # 3. 尝试音频分离（如果 demucs 可用）
        separated_tracks = separate_audio_demucs(audio_path, output_dir)
        has_vocals = separated_tracks and 'vocals' in separated_tracks

        # 4. 语音转文字
        transcription = []
        subtitle_lines = []

        if has_vocals and separated_tracks and 'vocals' in separated_tracks:
            transcription = transcribe_with_whisper(separated_tracks['vocals'])
        elif Path(audio_path).exists():
            # 如果没有成功分离，直接尝试识别原音频
            transcription = transcribe_with_whisper(audio_path)

        if transcription:
            subtitle_lines = [seg.text for seg in transcription]

        # 5. BGM 风格分析
        bgm_style = None
        has_bgm = False
        if separated_tracks and 'other' in separated_tracks:
            bgm_style = analyze_bgm_style(separated_tracks)
            has_bgm = True
        elif Path(audio_path).exists():
            # 如果分离失败，尝试从原始音频分析
            try:
                result = subprocess.run([
                    'ffprobe', '-v', 'quiet',
                    '-select_streams', 'a:0',
                    '-show_entries', 'stream=codec_type',
                    '-of', 'json',
                    video_path
                ], capture_output=True, text=True)
                info = json.loads(result.stdout)
                streams = info.get('streams', [])
                has_bgm = len(streams) > 0
            except:
                pass

        return AudioAnalysisResult(
            success=True,
            has_vocals=has_vocals,
            has_bgm=has_bgm,
            transcription=transcription if transcription else None,
            subtitle_lines=subtitle_lines if subtitle_lines else None,
            bgm_style=bgm_style,
            duration=duration,
            separated_audio_path=separated_tracks
        )

    except Exception as e:
        return AudioAnalysisResult(
            success=False,
            has_vocals=False,
            has_bgm=False,
            error=f"Audio analysis error: {str(e)}"
        )


def main():
    """
    命令行入口
    Usage:
        python audio_analyzer.py analyze <video_path> [output_dir]
        python audio_analyzer.py check
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: audio_analyzer.py <command> [args...]'
        }))
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == 'check':
        deps = check_dependencies()
        print(json.dumps({
            'success': True,
            'dependencies': deps
        }))
        return

    if command == 'transcribe':
        """
        新增 transcribe 命令：纯 ASR 转录（含 word_timestamps + 标点恢复）
        Usage: python audio_analyzer.py transcribe <audio_path> [language]
        """
        if len(sys.argv) < 3:
            print(json.dumps({'success': False, 'error': 'Usage: audio_analyzer.py transcribe <audio_path> [language]'}))
            sys.exit(1)

        audio_path = sys.argv[2]
        lang = sys.argv[3] if len(sys.argv) > 3 else 'auto'

        if not Path(audio_path).exists():
            print(json.dumps({'success': False, 'error': f'Audio file not found: {audio_path}'}))
            sys.exit(1)

        # Step 1: ASR 转录
        segments = transcribe_with_whisper(audio_path, lang)

        # Step 2: 标点恢复
        from punctuation_recovery import recover_punctuation
        segments_dict = [asdict(seg) for seg in segments]
        punctuated = recover_punctuation(segments_dict, method='rule', lang=lang or 'zh')

        # Step 3: 组装输出
        full_text = ' '.join(s['text'] for s in punctuated if s.get('text'))
        output = {
            'success': True,
            'duration': None,  # 由调用方通过 ffprobe 获取
            'segments': punctuated,
            'full_text': full_text,
            'punctuation_recovered': True,
        }
        print(json.dumps(output, ensure_ascii=False))
        return

    if command == 'analyze':
        if len(sys.argv) < 3:
            print(json.dumps({
                'success': False,
                'error': 'Usage: audio_analyzer.py analyze <video_path> [output_dir]'
            }))
            sys.exit(1)

        video_path = sys.argv[2]
        output_dir = sys.argv[3] if len(sys.argv) > 3 else tempfile.gettempdir()

        if not Path(video_path).exists():
            print(json.dumps({
                'success': False,
                'error': f'Video file not found: {video_path}'
            }))
            sys.exit(1)

        result = analyze_video_audio(video_path, output_dir)

        # 输出结果
        if result.success:
            output = {
                'success': True,
                'has_vocals': result.has_vocals,
                'has_bgm': result.has_bgm,
                'duration': result.duration,
                'transcription': [asdict(seg) for seg in result.transcription] if result.transcription else None,
                'subtitle_lines': result.subtitle_lines,
                'bgm_style': asdict(result.bgm_style) if result.bgm_style else None,
                'separated_audio_path': result.separated_audio_path,
            }
        else:
            output = {
                'success': False,
                'error': result.error
            }

        print(json.dumps(output, ensure_ascii=False))
        return

    print(json.dumps({
        'success': False,
        'error': f'Unknown command: {command}'
    }))
    sys.exit(1)


if __name__ == '__main__':
    main()