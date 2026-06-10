#!/usr/bin/env python3
# =============================================================================
# TikStream AI — Punctuation Recovery (标点恢复)
# =============================================================================
# 对 Whisper 输出的无标点文本进行标点恢复
# 支持两种模式：
#   1. rule-based: 基于规则的轻量恢复（零依赖，默认）
#   2. ct-punc: 基于 BERT 的标点模型（需 pip install ct-punc）
# =============================================================================

import sys
import json
from typing import List, Dict, Optional, Any


def recover_punctuation_rule_based(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """基于规则的标点恢复（中文 + 英文）"""
    import re

    QUESTION_PATTERNS = re.compile(
        r'(.*?)(怎么|如何|为什么|什么|哪|吗|呢|吧|啊|可|能否|可否|是否|能不能|要不要)',
    )

    for i, seg in enumerate(segments):
        text = seg.get('text', '').strip()
        if not text:
            continue

        # 判断语言
        has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in text)

        if has_cjk:
            # 中文标点恢复
            text = _recover_cn_punctuation(text)
        else:
            # 英文标点恢复
            text = _recover_en_punctuation(text)

        # 句末标点补全
        if text and text[-1] not in '.!?。！？…,，':
            # 检查是否为疑问句
            if QUESTION_PATTERNS.match(text):
                text += '？'
            elif i < len(segments) - 1:
                text += '，' if has_cjk else ','
            else:
                text += '。' if has_cjk else '.'

        seg['text'] = text
        seg['punctuation_recovered'] = True

    return segments


def _recover_cn_punctuation(text: str) -> str:
    """中文标点规则"""
    # 段落开头不加标点
    # 疑问词后加问号 (由调用方处理)
    # 叹词后加感叹号
    import re

    # 感叹词
    exclamation_patterns = [
        (r'(太|真|好|非常|特别|超级|极)好(看|用|吃|玩)', r'\1好\2！'),
        (r'(加油|太棒了|厉害|绝了|完美|太神奇了)', r'\1！'),
    ]
    for pat, repl in exclamation_patterns:
        text = re.sub(pat, repl, text)

    return text


def _recover_en_punctuation(text: str) -> str:
    """英文标点规则"""
    import re

    # 常见连接词前加逗号
    text = re.sub(r'\s+(but)\s+', r', \1 ', text)
    text = re.sub(r'\s+(so)\s+', r', \1 ', text)
    text = re.sub(r'\s+(however)\s+', r', \1, ', text)
    text = re.sub(r'\s+(therefore)\s+', r', \1, ', text)

    return text


def recover_punctuation_ct_punc(
    segments: List[Dict[str, Any]],
    lang: str = 'zh',
) -> List[Dict[str, Any]]:
    """使用 ct-punc 模型进行标点恢复（精确但需要额外依赖）"""
    try:
        from ct_punc import PunctuationRestorer

        restorer = PunctuationRestorer(lang=lang)

        for seg in segments:
            text = seg.get('text', '').strip()
            if text:
                seg['text'] = restorer.restore(text)
            seg['punctuation_recovered'] = True

        return segments

    except ImportError:
        print(json.dumps({
            'warning': 'ct-punc not installed. Falling back to rule-based. Run: pip install ct-punc'
        }), file=sys.stderr)
        return recover_punctuation_rule_based(segments)
    except Exception as e:
        print(json.dumps({
            'warning': f'ct-punc failed: {str(e)}. Falling back to rule-based.'
        }), file=sys.stderr)
        return recover_punctuation_rule_based(segments)


def recover_punctuation(
    segments: List[Dict[str, Any]],
    method: str = 'rule',
    lang: str = 'zh',
) -> List[Dict[str, Any]]:
    """
    标点恢复统一入口

    Args:
        segments: Whisper 转录分段列表 [{"text", "start_sec", "end_sec", ...}]
        method: 恢复方法 ("rule" / "ct-punc" / "auto")
        lang: 语言代码

    Returns:
        标点恢复后的分段列表
    """
    if method == 'ct-punc':
        return recover_punctuation_ct_punc(segments, lang)

    # 默认使用规则方法
    return recover_punctuation_rule_based(segments)


if __name__ == '__main__':
    # 支持命令行调用：echo '[{"text":"..."},...]' | python punctuation_recovery.py [method] [lang]
    method = sys.argv[1] if len(sys.argv) > 1 else 'rule'
    lang = sys.argv[2] if len(sys.argv) > 2 else 'zh'

    raw_input = sys.stdin.read().strip()
    if raw_input:
        segments = json.loads(raw_input)
        result = recover_punctuation(segments, method, lang)
        print(json.dumps(result, ensure_ascii=False))
