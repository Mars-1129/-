import subprocess, json, tempfile, os, sys
print("Starting test...", flush=True)

import torch
print("torch OK", flush=True)

try:
    model, utils = torch.hub.load('snakers4/silero-vad', model='silero_vad', trust_repo=True)
    (get_speech_timestamps, _, _, _, _) = utils
    print("VAD model loaded OK", flush=True)
except Exception as e:
    print(f"VAD failed: {e}", flush=True)
    sys.exit(1)

try:
    from faster_whisper import WhisperModel
    m = WhisperModel('tiny', device='cpu', compute_type='int8')
    print("Whisper model loaded OK", flush=True)
except Exception as e:
    print(f"Whisper failed: {e}", flush=True)
    sys.exit(1)

print("ALL TESTS PASSED", flush=True)
