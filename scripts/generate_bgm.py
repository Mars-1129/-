"""
BGM Generator - Generate realistic background music for e-commerce videos
Uses additive/FM synthesis with numpy/scipy for high-quality audio
"""
import numpy as np
from scipy import signal
import wave
import struct
import os
import subprocess

SAMPLE_RATE = 44100
DURATION = 30  # seconds
BITS = 16
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'bgm')
MP3_BITRATE = '192k'


def float_to_pcm16(audio):
    """Convert float audio [-1, 1] to 16-bit PCM"""
    audio = np.clip(audio, -1.0, 1.0)
    return (audio * 32767).astype(np.int16)


def save_wav(filename, audio_left, audio_right, sr=SAMPLE_RATE):
    """Save stereo audio as WAV file"""
    audio_left = float_to_pcm16(audio_left)
    audio_right = float_to_pcm16(audio_right)
    stereo = np.column_stack((audio_left, audio_right)).flatten()

    with wave.open(filename, 'w') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(stereo.tobytes())


def convert_to_mp3(wav_path, mp3_path):
    """Convert WAV to MP3 using FFmpeg"""
    subprocess.run([
        'ffmpeg', '-y', '-i', wav_path,
        '-codec:a', 'libmp3lame', '-b:a', MP3_BITRATE,
        '-map_metadata', '-1',
        mp3_path
    ], capture_output=True)


def adsr_envelope(t, attack, decay, sustain, release):
    """ADSR envelope on array t (time in seconds for each sample)"""
    env = np.zeros_like(t)
    attack_mask = t < attack
    decay_mask = (t >= attack) & (t < attack + decay)
    sustain_mask = (t >= attack + decay) & (t < DURATION - release)
    release_mask = t >= DURATION - release

    env[attack_mask] = t[attack_mask] / attack
    env[decay_mask] = 1.0 - (1.0 - sustain) * (t[decay_mask] - attack) / decay
    env[sustain_mask] = sustain
    env[release_mask] = sustain * (1.0 - (t[release_mask] - (DURATION - release)) / release)
    return env


def sine_wave(freq, t, phase=0):
    return np.sin(2 * np.pi * freq * t + phase)


def saw_wave(freq, t, harmonics=8):
    """Band-limited sawtooth wave"""
    result = np.zeros_like(t)
    for i in range(1, harmonics + 1):
        result += (-1) ** (i + 1) * np.sin(2 * np.pi * i * freq * t) / i
    return result * (2 / np.pi)


def square_wave(freq, t, harmonics=7):
    """Band-limited square wave"""
    result = np.zeros_like(t)
    for i in range(1, harmonics * 2, 2):
        result += np.sin(2 * np.pi * i * freq * t) / i
    return result * (4 / np.pi)


def triangle_wave(freq, t, harmonics=6):
    """Band-limited triangle wave"""
    result = np.zeros_like(t)
    for i in range(1, harmonics * 2, 2):
        result += (-1) ** ((i - 1) // 2) * np.sin(2 * np.pi * i * freq * t) / i ** 2
    return result * (8 / np.pi ** 2)


def lowpass(audio, cutoff, sr=SAMPLE_RATE, order=4):
    """Apply low-pass filter"""
    nyq = sr / 2
    b, a = signal.butter(order, cutoff / nyq, btype='low')
    return signal.filtfilt(b, a, audio)


def highpass(audio, cutoff, sr=SAMPLE_RATE, order=4):
    """Apply high-pass filter"""
    nyq = sr / 2
    b, a = signal.butter(order, cutoff / nyq, btype='high')
    return signal.filtfilt(b, a, audio)


def bandpass(audio, low, high, sr=SAMPLE_RATE, order=4):
    """Apply band-pass filter"""
    nyq = sr / 2
    b, a = signal.butter(order, [low / nyq, high / nyq], btype='band')
    return signal.filtfilt(b, a, audio)


def reverb(audio, decay=0.3, delay_ms=40):
    """Simple reverb effect using comb filter"""
    delay_samples = int(delay_ms / 1000 * SAMPLE_RATE)
    result = audio.copy()
    for i in range(1, 4):
        shift = delay_samples * i
        if shift < len(audio):
            result[shift:] += audio[:-shift] * (decay ** i)
    return result * 0.6


def drum_kick(freq_start, freq_end, t):
    """Synthesize kick drum - frequency sweep"""
    freq = freq_start + (freq_end - freq_start) * t / 0.15
    freq = np.where(t < 0.15, freq, freq_end)
    audio = np.sin(2 * np.pi * freq * t)
    env = np.exp(-t * 20)
    return audio * env


def drum_snare(t, noise_amount=0.7):
    """Synthesize snare drum"""
    tone = np.sin(2 * np.pi * 200 * t) * np.exp(-t * 8)
    noise = np.random.randn(len(t)) * np.exp(-t * 12)
    result = tone * (1 - noise_amount) + noise * noise_amount
    return result * 0.8


def hihat(t):
    """Synthesize hi-hat"""
    noise = np.random.randn(len(t))
    noise = highpass(noise, 8000)
    env = np.exp(-t * 60)
    return noise * env * 0.5


def generate_energetic_upbeat_01():
    """Generate energetic-upbeat-01 (120 BPM)"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 120
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Kick on beats 1, 3
    for beat in range(0, int(DURATION / beat_time), 2):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        kick_len = int(0.2 * SAMPLE_RATE)
        if idx + kick_len < len(t):
            kick_t = np.linspace(0, 0.2, kick_len, endpoint=False)
            audio[idx:idx + kick_len] += drum_kick(150, 50, kick_t) * 0.8

    # Snare on beats 2, 4
    for beat in range(1, int(DURATION / beat_time), 2):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        snare_len = int(0.15 * SAMPLE_RATE)
        if idx + snare_len < len(t):
            snare_t = np.linspace(0, 0.15, snare_len, endpoint=False)
            audio[idx:idx + snare_len] += drum_snare(snare_t) * 0.7

    # Hi-hat every 8th note
    for beat in range(int(DURATION * 8 / beat_time)):
        start = beat * beat_time / 8
        idx = int(start * SAMPLE_RATE)
        hh_len = int(0.05 * SAMPLE_RATE)
        if idx + hh_len < len(t):
            hh_t = np.linspace(0, 0.05, hh_len, endpoint=False)
            audio[idx:idx + hh_len] += hihat(hh_t) * 0.4

    # Bass synth line (sidechain-like)
    bass_t = t.copy()
    bass_freq = np.zeros_like(t)
    pattern_notes = [55, 55, 55, 55, 49, 49, 49, 49, 52, 52, 52, 52, 57, 57, 57, 57]
    note_len = beat_time
    for i, freq in enumerate(pattern_notes):
        start = i * note_len
        end = start + note_len
        mask = (t >= start) & (t < end)
        bass_freq[mask] = freq
    bass_osc = saw_wave(2, t)  # We'll modulate manually
    # Simple bass: use square wave
    bass = np.zeros_like(t)
    for i, freq in enumerate(pattern_notes):
        start = i * note_len
        end = start + note_len
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        bass[mask] = square_wave(freq, note_t, 4) * 0.3
        # Sidechain duck
        kick_mask = (t >= i * note_len) & (t < i * note_len + 0.15)
        bass[kick_mask] *= 0.3

    # Bright synth chords (saw wave with filter)
    chord_notes = [220, 277, 330, 220, 196, 247, 294, 196, 208, 262, 312, 208, 233, 294, 349, 233]
    pad = np.zeros_like(t)
    for i, freq in enumerate(chord_notes):
        start = i * note_len
        end = start + note_len * 0.9
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        # Layer fundamental + fifth
        pad_t = np.zeros_like(note_t)
        pad_t += saw_wave(freq, note_t, 5) * 0.4
        pad_t += saw_wave(freq * 1.4983, note_t, 5) * 0.25
        pad_t += sine_wave(freq * 2, note_t) * 0.1
        env = adsr_envelope(note_t, 0.01, 0.05, 0.7, 0.3)
        pad[mask] += pad_t * env

    pad = lowpass(pad, 4000)
    audio += pad * 0.7

    # Stereo width
    audio_left = audio + np.random.randn(len(t)) * 0.003
    audio_right = audio + np.random.randn(len(t)) * 0.003

    # Master EQ
    audio_left = highpass(audio_left, 30)
    audio_right = highpass(audio_right, 30)

    # Limiter
    audio_left = np.tanh(audio_left * 1.5) * 0.85
    audio_right = np.tanh(audio_right * 1.5) * 0.85

    return audio_left, audio_right


def generate_energetic_upbeat_02():
    """Generate energetic-upbeat-02 (128 BPM) - Modern tech/urban feel"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 128
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Four-on-the-floor kick
    for beat in range(int(DURATION / beat_time)):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        kick_len = int(0.18 * SAMPLE_RATE)
        if idx + kick_len < len(t):
            kick_t = np.linspace(0, 0.18, kick_len, endpoint=False)
            audio[idx:idx + kick_len] += drum_kick(140, 45, kick_t) * 0.85

    # Clap on 2 and 4
    for beat in range(1, int(DURATION / beat_time), 2):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        snare_len = int(0.12 * SAMPLE_RATE)
        if idx + snare_len < len(t):
            snare_t = np.linspace(0, 0.12, snare_len, endpoint=False)
            audio[idx:idx + snare_len] += drum_snare(snare_t, 0.5) * 0.6

    # Hi-hat 16th notes (off-beat)
    for beat in range(int(DURATION * 4 / beat_time)):
        start = beat * beat_time / 4
        idx = int(start * SAMPLE_RATE)
        hh_len = int(0.04 * SAMPLE_RATE)
        if idx + hh_len < len(t):
            hh_t = np.linspace(0, 0.04, hh_len, endpoint=False)
            vol = 0.5 if beat % 2 == 0 else 0.3
            audio[idx:idx + hh_len] += hihat(hh_t) * vol

    # Deep bass synth
    bass_notes = [41, 41, 41, 41, 36, 36, 41, 41, 39, 39, 39, 39, 34, 34, 39, 39]
    note_len = beat_time
    bass = np.zeros_like(t)
    for i, freq in enumerate(bass_notes):
        start = i * note_len
        end = start + note_len
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        bass_t = triangle_wave(freq, note_t, 4) * 0.35
        bass_t += square_wave(freq * 0.5, note_t, 3) * 0.2
        env = adsr_envelope(note_t, 0.005, 0.1, 0.6, 0.15)
        bass[mask] += bass_t * env
        kick_mask = (t >= start) & (t < start + 0.12)
        bass[kick_mask] *= 0.2

    bass = lowpass(bass, 300)
    audio += bass * 0.8

    # Arpeggio synth
    arp = np.zeros_like(t)
    arp_notes = [330, 392, 494, 587, 494, 392, 330, 294, 311, 370, 466, 554, 466, 370, 311, 277]
    for i, freq in enumerate(arp_notes):
        start = i * note_len
        end = start + note_len * 0.85
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        arp_t = saw_wave(freq, note_t, 4) * 0.2
        arp_t += sine_wave(freq * 2, note_t) * 0.08
        env = adsr_envelope(note_t, 0.005, 0.08, 0.5, 0.2)
        arp[mask] += arp_t * env

    arp = lowpass(arp, 6000)
    arp = bandpass(arp, 200, 8000)
    audio += arp * 0.6

    audio_left = audio + np.random.randn(len(t)) * 0.002
    audio_right = audio + np.random.randn(len(t)) * 0.002

    audio_left = highpass(audio_left, 30)
    audio_right = highpass(audio_right, 30)
    audio_left = np.tanh(audio_left * 1.5) * 0.85
    audio_right = np.tanh(audio_right * 1.5) * 0.85

    return audio_left, audio_right


def generate_calm_relax_01():
    """Generate calm-relax-01 (72 BPM) - Soft, spa-like ambient"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    audio = np.zeros_like(t)

    # Warm pad - layered sine waves
    pad = np.zeros_like(t)
    root_notes = [65, 73, 65, 61, 65, 73, 65, 61, 69, 77, 69, 65, 69, 73, 65, 73]
    bpm = 72
    beat_time = 60 / bpm
    note_len = beat_time * 2

    for i, freq in enumerate(root_notes):
        start = i * note_len
        end = start + note_len * 1.5
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        # Rich harmonic pad
        chord_t = np.zeros_like(note_t)
        chord_t += sine_wave(freq, note_t) * 0.4
        chord_t += sine_wave(freq * 1.5, note_t) * 0.2
        chord_t += sine_wave(freq * 2, note_t) * 0.15
        chord_t += sine_wave(freq * 3, note_t) * 0.1
        chord_t += sine_wave(freq * 0.5, note_t) * 0.3
        env = adsr_envelope(note_t, 0.3, 0.5, 0.6, 1.5)
        pad[mask] += chord_t * env

    pad = lowpass(pad, 800)
    audio += pad * 0.7

    # Gentle filtered noise texture
    noise = np.random.randn(len(t))
    noise = lowpass(noise, 3000)
    noise_env = adsr_envelope(t, 0.5, 2.0, 0.3, 2.0)
    audio += noise * noise_env * 0.04

    # Soft bell-like melody
    bell_notes = [523, 659, 784, 523, 440, 523, 659, 440, 494, 587, 698, 494, 392, 494, 587, 392]
    melody = np.zeros_like(t)
    for i, freq in enumerate(bell_notes):
        start = i * note_len
        end = start + note_len * 0.7
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        # Bell-like: fundamental + higher harmonics decaying
        bell_t = sine_wave(freq, note_t) * np.exp(-note_t * 2)
        bell_t += sine_wave(freq * 2.76, note_t) * np.exp(-note_t * 4) * 0.3
        bell_t += sine_wave(freq * 5.4, note_t) * np.exp(-note_t * 6) * 0.15
        env = adsr_envelope(note_t, 0.005, 0.3, 0.1, 0.6)
        melody[mask] += bell_t * env * 0.5

    melody = lowpass(melody, 5000)
    audio += melody * 0.4

    # Soft sub bass
    sub = np.zeros_like(t)
    for i, freq in enumerate([f / 2 for f in root_notes]):
        start = i * note_len
        end = start + note_len
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        sub_t = sine_wave(freq / 2, note_t)
        env = adsr_envelope(note_t, 0.2, 0.5, 0.5, 1.0)
        sub[mask] += sub_t * env * 0.15
    sub = lowpass(sub, 150)
    audio += sub

    audio_left = audio
    audio_right = audio
    # Slight stereo spread via delay
    delay_ms = 15
    delay_samples = int(delay_ms / 1000 * SAMPLE_RATE)
    audio_right = np.roll(audio_right, delay_samples)
    audio_right[:delay_samples] = 0

    audio_left = np.tanh(audio_left * 1.2) * 0.9
    audio_right = np.tanh(audio_right * 1.2) * 0.9

    return audio_left, audio_right


def generate_calm_relax_02():
    """Generate calm-relax-02 (80 BPM) - Gentle melody, nature feel"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 80
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Warm pad with slow evolution
    pad_notes = [73, 77, 73, 69, 77, 73, 82, 77]
    note_len = beat_time * 4
    pad = np.zeros_like(t)
    for i, freq in enumerate(pad_notes):
        start = i * note_len
        end = start + note_len
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        chord_t = np.zeros_like(note_t)
        chord_t += sine_wave(freq, note_t) * 0.5
        chord_t += sine_wave(freq * 1.25, note_t) * 0.25
        chord_t += sine_wave(freq * 1.4983, note_t) * 0.2
        chord_t += sine_wave(freq * 0.75, note_t) * 0.15
        env = adsr_envelope(note_t, 0.5, 1.0, 0.5, 2.0)
        pad[mask] += chord_t * env

    pad = lowpass(pad, 1500)
    audio += pad * 0.6

    # Plucked string-like melody
    pluck_notes = [587, 523, 440, 523, 587, 659, 523, 440, 392, 440, 523, 440, 392, 349, 330, 392,
                   440, 523, 440, 392, 349, 330, 294, 330, 349, 392, 440, 523, 587, 659, 587, 523]
    pluck = np.zeros_like(t)
    for i, freq in enumerate(pluck_notes):
        start = i * note_len / 4
        end = start + 0.8
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        pluck_t = triangle_wave(freq, note_t, 8) * np.exp(-note_t * 3)
        pluck_t += sine_wave(freq * 2, note_t) * np.exp(-note_t * 5) * 0.2
        pluck[mask] += pluck_t * 0.35

    pluck = lowpass(pluck, 8000)
    audio += pluck * 0.5

    # Soft noise floor
    noise = np.random.randn(len(t))
    noise = lowpass(noise, 5000)
    audio += noise * 0.008

    # Sub bass
    sub = np.zeros_like(t)
    sub_freqs = [36, 36, 38, 38, 36, 36, 41, 41]
    for i, freq in enumerate(sub_freqs):
        start = i * note_len
        mask = (t >= start) & (t < start + note_len)
        note_t = t[mask] - start
        sub_t = sine_wave(freq, note_t)
        env = adsr_envelope(note_t, 0.3, 0.5, 0.4, 1.5)
        sub[mask] += sub_t * env * 0.15
    sub = lowpass(sub, 200)
    audio += sub

    audio_left = audio
    audio_right = np.roll(audio, int(20 / 1000 * SAMPLE_RATE))
    audio_right[:int(20 / 1000 * SAMPLE_RATE)] = 0

    audio_left = np.tanh(audio_left * 1.2) * 0.9
    audio_right = np.tanh(audio_right * 1.2) * 0.9

    return audio_left, audio_right


def generate_dramatic_impact_01():
    """Generate dramatic-impact-01 (100 BPM) - Tension, reveal, impact"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    audio = np.zeros_like(t)

    # Dark drone - low frequency rumble
    drone = sine_wave(41, t) * 0.3 + sine_wave(61, t) * 0.15 + sine_wave(82, t) * 0.1
    drone_env = np.ones_like(t) * 0.6
    # Increase tension in middle
    drone_env += 0.4 * (1 - np.exp(-((t - 15) ** 2) / 50))
    audio += drone * drone_env

    # Tension-building filtered noise
    noise = np.random.randn(len(t))
    noise_freq = 200 + 3000 * (np.clip(t / 20, 0, 1))  # Rising filter
    noise = lowpass(noise, 3000)
    # Modulate noise cutoff
    noise_env = 0.02 + 0.06 * np.clip(t / 15, 0, 1)
    audio += noise * noise_env

    # Rhythmic percussion - building
    bpm = 100
    beat_time = 60 / bpm
    # Kick on beat 1, building intensity
    for beat in range(int(DURATION / beat_time)):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        kick_len = int(0.25 * SAMPLE_RATE)
        if idx + kick_len < len(t):
            kick_t = np.linspace(0, 0.25, kick_len, endpoint=False)
            vol = 0.3 + 0.5 * min(beat / (int(DURATION / beat_time)), 1.0)
            kick = drum_kick(120, 35, kick_t) * vol
            audio[idx:idx + kick_len] += kick

    # Impact at key moments
    for impact_time in [8, 16, 24]:
        idx = int(impact_time * SAMPLE_RATE)
        imp_len = int(1.5 * SAMPLE_RATE)
        if idx + imp_len < len(t):
            imp_t = np.linspace(0, 1.5, imp_len, endpoint=False)
            impact = np.zeros_like(imp_t)
            impact += sine_wave(55, imp_t) * np.exp(-imp_t * 2) * 0.5
            impact += sine_wave(110, imp_t) * np.exp(-imp_t * 3) * 0.3
            impact += sine_wave(220, imp_t) * np.exp(-imp_t * 5) * 0.15
            impact += np.random.randn(len(imp_t)) * np.exp(-imp_t * 8) * 0.2
            audio[idx:idx + imp_len] += impact

    # Tension riser
    riser_t = np.linspace(0, 1, int(3 * SAMPLE_RATE))
    riser = np.zeros_like(riser_t)
    for i in range(10):
        freq = 100 * (i + 1)
        riser += sine_wave(freq, riser_t, np.random.random() * 2 * np.pi) * 0.05

    # Place risers
    for riser_start in [6, 13, 20]:
        idx = int(riser_start * SAMPLE_RATE)
        if idx + len(riser_t) < len(audio):
            audio[idx:idx + len(riser_t)] += riser * 0.5

    # Synth bass hits
    bass = np.zeros_like(t)
    for beat in range(0, int(DURATION / beat_time), 4):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        bass_len = int(beat_time * 2 * SAMPLE_RATE)
        if idx + bass_len < len(bass):
            bass_t = np.linspace(0, beat_time * 2, bass_len, endpoint=False)
            bass_hit = square_wave(55, bass_t, 4) * 0.3
            bass_hit += square_wave(82, bass_t, 3) * 0.15
            env = np.exp(-bass_t * 1.5)
            bass[idx:idx + bass_len] += bass_hit * env

    audio += bass * 0.6

    audio_left = audio
    audio_right = audio
    audio_left = np.tanh(audio_left * 1.3) * 0.88
    audio_right = np.tanh(audio_right * 1.3) * 0.88

    return audio_left, audio_right


def generate_playful_cute_01():
    """Generate playful-cute-01 (110 BPM) - Bouncy, fun, positive"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 110
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Light kick
    for beat in range(0, int(DURATION / beat_time), 2):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        kick_len = int(0.12 * SAMPLE_RATE)
        if idx + kick_len < len(t):
            kick_t = np.linspace(0, 0.12, kick_len, endpoint=False)
            audio[idx:idx + kick_len] += drum_kick(160, 60, kick_t) * 0.4

    # Clicky snare
    for beat in range(1, int(DURATION / beat_time), 2):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        sn_len = int(0.08 * SAMPLE_RATE)
        if idx + sn_len < len(t):
            sn_t = np.linspace(0, 0.08, sn_len, endpoint=False)
            click = np.sin(2 * np.pi * 800 * sn_t) * np.exp(-sn_t * 40) * 0.3
            click += np.random.randn(len(sn_t)) * np.exp(-sn_t * 30) * 0.15
            audio[idx:idx + sn_len] += click

    # Bouncy synth melody
    melody_notes = [
        587, 523, 587, 659, 784, 659, 587, 523,
        440, 523, 587, 523, 440, 392, 440, 392,
        587, 659, 784, 880, 784, 659, 587, 523,
        440, 523, 440, 392, 349, 330, 294, 330
    ]
    note_len = beat_time / 2
    melody = np.zeros_like(t)
    for i, freq in enumerate(melody_notes):
        start = i * note_len
        end = start + note_len * 0.85
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        # Bright, sparkly sound
        m_t = triangle_wave(freq, note_t, 6) * 0.3
        m_t += sine_wave(freq * 2, note_t) * 0.15
        m_t += sine_wave(freq * 3, note_t) * 0.08
        env = adsr_envelope(note_t, 0.005, 0.05, 0.5, 0.1)
        melody[mask] += m_t * env

    melody = highpass(melody, 200)
    melody = lowpass(melody, 12000)
    audio += melody * 0.6

    # Sparkle bell hits
    bell = np.zeros_like(t)
    for beat in range(0, int(DURATION / beat_time), 4):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        bell_len = int(0.5 * SAMPLE_RATE)
        if idx + bell_len < len(bell):
            bell_t = np.linspace(0, 0.5, bell_len, endpoint=False)
            bell_hit = sine_wave(1047, bell_t) * np.exp(-bell_t * 4)
            bell_hit += sine_wave(1319, bell_t) * np.exp(-bell_t * 6) * 0.3
            bell_hit += sine_wave(1568, bell_t) * np.exp(-bell_t * 8) * 0.15
            bell[idx:idx + bell_len] += bell_hit * 0.3

    audio += bell

    # Bass
    bass = np.zeros_like(t)
    bass_notes = [73, 73, 65, 65, 69, 69, 55, 55]
    bass_note_len = beat_time * 4
    for i, freq in enumerate(bass_notes):
        start = i * bass_note_len
        end = start + bass_note_len
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        bass_t = triangle_wave(freq / 2, note_t, 3) * 0.2
        bass_t += sine_wave(freq / 2, note_t) * 0.15
        env = adsr_envelope(note_t, 0.01, 0.1, 0.5, 0.2)
        bass[mask] += bass_t * env

    bass = lowpass(bass, 300)
    audio += bass * 0.8

    audio_left = audio
    audio_right = np.roll(audio, int(12 / 1000 * SAMPLE_RATE))
    audio_right[:int(12 / 1000 * SAMPLE_RATE)] = 0

    audio_left = np.tanh(audio_left * 1.1) * 0.9
    audio_right = np.tanh(audio_right * 1.1) * 0.9

    return audio_left, audio_right


def generate_inspirational_uplift_01():
    """Generate inspirational-uplift-01 (115 BPM) - Rising, hopeful, motivational"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 115
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Building energy curve
    energy = np.clip(t / (DURATION * 0.5), 0, 1) ** 1.5

    # Kick drum, increasing intensity
    for beat in range(int(DURATION / beat_time)):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        kick_len = int(0.18 * SAMPLE_RATE)
        if idx + kick_len < len(t):
            kick_t = np.linspace(0, 0.18, kick_len, endpoint=False)
            vol = 0.3 + 0.5 * energy[min(idx, len(energy) - 1)]
            audio[idx:idx + kick_len] += drum_kick(150, 45, kick_t) * vol

    # Warm synth pad - gradually building
    pad_notes = [65, 73, 82, 73, 77, 87, 73, 82, 69, 77, 87, 77, 73, 82, 69, 77]
    note_len = beat_time * 2
    pad = np.zeros_like(t)
    for i, freq in enumerate(pad_notes):
        start = i * note_len
        end = start + note_len * 1.3
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        chord_t = np.zeros_like(note_t)
        chord_t += sine_wave(freq, note_t) * 0.5
        chord_t += sine_wave(freq * 1.2599, note_t) * 0.25
        chord_t += sine_wave(freq * 1.4983, note_t) * 0.3
        chord_t += sine_wave(freq * 2, note_t) * 0.15
        chord_t += sine_wave(freq * 0.5, note_t) * 0.2
        env = adsr_envelope(note_t, 0.2, 0.3, 0.6, 1.0)
        env *= (0.4 + 0.6 * min((i + 1) / len(pad_notes), 1.0))
        pad[mask] += chord_t * env

    pad = lowpass(pad, 3000)
    audio += pad * 0.7

    # String-like melody - rising
    melody = np.zeros_like(t)
    melody_notes = [
        392, 440, 523, 440, 494, 587, 659, 587,
        523, 659, 784, 659, 698, 784, 880, 784,
        784, 880, 988, 880, 784, 988, 1047, 988,
        880, 988, 784, 698, 659, 784, 880, 784
    ]
    for i, freq in enumerate(melody_notes):
        start = i * note_len / 2
        end = start + note_len * 0.7
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        m_t = saw_wave(freq, note_t, 6) * 0.25
        m_t += sine_wave(freq * 2, note_t) * 0.1
        m_t += sine_wave(freq * 3, note_t) * 0.05
        env = adsr_envelope(note_t, 0.05, 0.15, 0.4, 0.5)
        melody[mask] += m_t * env

    melody = lowpass(melody, 8000)
    melody *= (0.4 + 0.6 * energy)
    audio += melody * 0.6

    # Percussion build
    for beat in range(int(DURATION / beat_time)):
        start = beat * beat_time + beat_time / 2
        idx = int(start * SAMPLE_RATE)
        hh_len = int(0.04 * SAMPLE_RATE)
        if idx + hh_len < len(t):
            hh_t = np.linspace(0, 0.04, hh_len, endpoint=False)
            audio[idx:idx + hh_len] += hihat(hh_t) * 0.3 * min(energy[min(idx, len(energy) - 1)], 1.0)

    # String swell at climax
    swell_start = int(20 * SAMPLE_RATE)
    swell_len = int(3 * SAMPLE_RATE)
    if swell_start + swell_len < len(t):
        swell_t = np.linspace(0, 3, swell_len)
        swell = np.zeros(swell_len)
        swell += sine_wave(261, swell_t) * 0.3
        swell += sine_wave(329, swell_t) * 0.25
        swell += sine_wave(392, swell_t) * 0.2
        swell += sine_wave(523, swell_t) * 0.15
        env_swell = np.clip(swell_t / 1.5, 0, 1) * np.exp(-(swell_t - 1.5) / 1.5)
        env_swell = np.where(swell_t < 1.5, swell_t / 1.5, np.exp(-(swell_t - 1.5) / 1.5))
        audio[swell_start:swell_start + swell_len] += swell * env_swell * 0.5

    audio_left = audio
    audio_right = np.roll(audio, int(18 / 1000 * SAMPLE_RATE))
    audio_right[:int(18 / 1000 * SAMPLE_RATE)] = 0

    audio_left = highpass(audio_left, 30)
    audio_right = highpass(audio_right, 30)
    audio_left = np.tanh(audio_left * 1.2) * 0.9
    audio_right = np.tanh(audio_right * 1.2) * 0.9

    return audio_left, audio_right


def generate_fashion_trend_01():
    """Generate fashion-trend-01 (124 BPM) - Modern, stylish, urban"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 124
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Tight kick
    for beat in range(int(DURATION / beat_time)):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        kick_len = int(0.15 * SAMPLE_RATE)
        if idx + kick_len < len(t):
            kick_t = np.linspace(0, 0.15, kick_len, endpoint=False)
            audio[idx:idx + kick_len] += drum_kick(150, 40, kick_t) * 0.7

    # Snare on 2 and 4
    for beat in range(1, int(DURATION / beat_time), 2):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        sn_len = int(0.1 * SAMPLE_RATE)
        if idx + sn_len < len(t):
            sn_t = np.linspace(0, 0.1, sn_len, endpoint=False)
            audio[idx:idx + sn_len] += drum_snare(sn_t, 0.6) * 0.5

    # Closed hi-hat 8th notes
    for beat in range(int(DURATION * 2 / beat_time)):
        start = beat * beat_time / 2
        idx = int(start * SAMPLE_RATE)
        hh_len = int(0.03 * SAMPLE_RATE)
        if idx + hh_len < len(t):
            hh_t = np.linspace(0, 0.03, hh_len, endpoint=False)
            audio[idx:idx + hh_len] += hihat(hh_t) * 0.35

    # Deep house bass
    bass_notes = [46, 46, 46, 46, 41, 41, 46, 46, 44, 44, 44, 44, 39, 39, 44, 44]
    note_len = beat_time
    bass = np.zeros_like(t)
    for i, freq in enumerate(bass_notes):
        start = i * note_len
        end = start + note_len
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        bass_t = saw_wave(freq, note_t, 5) * 0.35
        bass_t += square_wave(freq * 0.5, note_t, 3) * 0.2
        env = adsr_envelope(note_t, 0.005, 0.08, 0.5, 0.1)
        bass[mask] += bass_t * env
        # Sidechain duck
        kick_mask = (t >= start) & (t < start + 0.1)
        bass[kick_mask] *= 0.25

    bass = lowpass(bass, 400)
    audio += bass * 0.85

    # Chic synth chords
    chord_notes = [
        [220, 277, 330], [220, 277, 330], [196, 247, 294], [196, 247, 294],
        [208, 262, 312], [208, 262, 312], [233, 294, 349], [233, 294, 349]
    ]
    chord_note_len = note_len * 2
    chords = np.zeros_like(t)
    for i, freqs in enumerate(chord_notes):
        start = i * chord_note_len
        end = start + chord_note_len * 0.85
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        chord_t = np.zeros_like(note_t)
        for f in freqs:
            chord_t += saw_wave(f, note_t, 4) * 0.25
        chord_t += sine_wave(freqs[0] * 2, note_t) * 0.1
        env = adsr_envelope(note_t, 0.01, 0.1, 0.5, 0.3)
        chords[mask] += chord_t * env

    chords = lowpass(chords, 5000)
    audio += chords * 0.55

    # FX sweeps
    for sweep_time in [6, 14, 22]:
        idx = int(sweep_time * SAMPLE_RATE)
        sweep_len = int(1.5 * SAMPLE_RATE)
        if idx + sweep_len < len(t):
            sweep_t = np.linspace(0, 1.5, sweep_len, endpoint=False)
            sweep = np.zeros(sweep_len)
            for j in range(3):
                sweep += sine_wave(200 * (j + 1) * (1 + sweep_t), sweep_t) * 0.08
            sweep_env = np.sin(np.pi * sweep_t / 1.5)
            audio[idx:idx + sweep_len] += sweep * sweep_env * 0.3

    audio_left = audio + np.random.randn(len(t)) * 0.002
    audio_right = audio + np.random.randn(len(t)) * 0.002

    audio_left = highpass(audio_left, 30)
    audio_right = highpass(audio_right, 30)
    audio_left = np.tanh(audio_left * 1.4) * 0.87
    audio_right = np.tanh(audio_right * 1.4) * 0.87

    return audio_left, audio_right


def generate_beauty_elegant_01():
    """Generate beauty-elegant-01 (85 BPM) - Sophisticated, luxury, feminine"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 85
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Soft piano-like pad
    pad_notes = [82, 87, 92, 87, 82, 87, 78, 82, 87, 92, 98, 92, 87, 82, 78, 77]
    note_len = beat_time * 2
    pad = np.zeros_like(t)
    for i, freq in enumerate(pad_notes):
        start = i * note_len
        end = start + note_len * 1.4
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        # Piano-like: fundamental + harmonics with envelope
        chord_t = np.zeros_like(note_t)
        chord_t += sine_wave(freq, note_t) * 0.5
        chord_t += sine_wave(freq * 2, note_t) * 0.2
        chord_t += sine_wave(freq * 3, note_t) * 0.1
        chord_t += sine_wave(freq * 0.5, note_t) * 0.3
        env = adsr_envelope(note_t, 0.15, 0.4, 0.3, 1.5)
        pad[mask] += chord_t * env

    pad = lowpass(pad, 4000)
    audio += pad * 0.6

    # Elegant melody
    melody_notes = [
        523, 587, 659, 523, 494, 523, 659, 587,
        523, 494, 440, 392, 440, 523, 494, 440,
        523, 587, 659, 784, 659, 587, 523, 494,
        440, 494, 523, 440, 392, 349, 330, 294
    ]
    melody = np.zeros_like(t)
    for i, freq in enumerate(melody_notes):
        start = i * note_len / 2
        end = start + note_len / 2 * 0.8
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        m_t = triangle_wave(freq, note_t, 6) * 0.35
        m_t += sine_wave(freq * 2, note_t) * 0.15
        m_t += sine_wave(freq * 3, note_t) * 0.08
        env = adsr_envelope(note_t, 0.02, 0.1, 0.4, 0.3)
        melody[mask] += m_t * env

    melody = lowpass(melody, 10000)
    audio += melody * 0.45

    # Soft percussion - rim clicks and light shaker
    for beat in range(0, int(DURATION / beat_time), 4):
        start = beat * beat_time
        idx = int(start * SAMPLE_RATE)
        click_len = int(0.05 * SAMPLE_RATE)
        if idx + click_len < len(t):
            click_t = np.linspace(0, 0.05, click_len, endpoint=False)
            audio[idx:idx + click_len] += sine_wave(3000, click_t) * np.exp(-click_t * 200) * 0.15

    # Sub bass
    sub = np.zeros_like(t)
    sub_freqs = [41, 43, 39, 41, 43, 43, 39, 38]
    for i, freq in enumerate(sub_freqs):
        start = i * note_len
        mask = (t >= start) & (t < start + note_len)
        note_t = t[mask] - start
        sub_t = sine_wave(freq, note_t)
        env = adsr_envelope(note_t, 0.2, 0.3, 0.3, 1.0)
        sub[mask] += sub_t * env * 0.12
    sub = lowpass(sub, 150)
    audio += sub

    # Sparkle texture
    sparkle = np.random.randn(len(t))
    sparkle = bandpass(sparkle, 8000, 15000)
    sparkle_env = 0.003 + 0.005 * np.sin(2 * np.pi * 0.3 * t) ** 2
    audio += sparkle * sparkle_env

    audio_left = audio
    audio_right = np.roll(audio, int(25 / 1000 * SAMPLE_RATE))
    audio_right[:int(25 / 1000 * SAMPLE_RATE)] = 0

    audio_left = np.tanh(audio_left * 1.1) * 0.92
    audio_right = np.tanh(audio_right * 1.1) * 0.92

    return audio_left, audio_right


def generate_beauty_elegant_02():
    """Generate beauty-elegant-02 (90 BPM) - Clean, minimal, premium"""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    bpm = 90
    beat_time = 60 / bpm
    audio = np.zeros_like(t)

    # Clean, minimal pad
    pad_notes = [87, 82, 78, 82, 87, 92, 87, 82]
    note_len = beat_time * 4
    pad = np.zeros_like(t)
    for i, freq in enumerate(pad_notes):
        start = i * note_len
        end = start + note_len * 1.3
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        chord_t = np.zeros_like(note_t)
        chord_t += sine_wave(freq, note_t) * 0.5
        chord_t += sine_wave(freq * 1.1892, note_t) * 0.2
        chord_t += sine_wave(freq * 1.4983, note_t) * 0.15
        chord_t += sine_wave(freq * 2, note_t) * 0.1
        env = adsr_envelope(note_t, 0.3, 0.8, 0.3, 2.0)
        pad[mask] += chord_t * env

    pad = lowpass(pad, 2000)
    audio += pad * 0.55

    # Delicate glass/bell melody
    bell_notes = [
        784, 698, 659, 587, 523, 587, 659, 698,
        784, 880, 784, 698, 659, 587, 523, 494,
        587, 659, 784, 698, 659, 784, 880, 784,
        698, 659, 587, 523, 440, 494, 523, 587
    ]
    bell = np.zeros_like(t)
    for i, freq in enumerate(bell_notes):
        start = i * note_len / 4
        end = start + 0.9
        mask = (t >= start) & (t < end)
        note_t = t[mask] - start
        bell_t = sine_wave(freq, note_t) * np.exp(-note_t * 2.5)
        bell_t += sine_wave(freq * 2.5, note_t) * np.exp(-note_t * 5) * 0.2
        bell_t += sine_wave(freq * 4.2, note_t) * np.exp(-note_t * 7) * 0.08
        bell[mask] += bell_t * 0.25

    bell = lowpass(bell, 12000)
    audio += bell * 0.5

    # Minimal sub
    sub = np.zeros_like(t)
    sub_freqs = [43, 41, 39, 41]
    for i, freq in enumerate(sub_freqs):
        start = i * note_len
        mask = (t >= start) & (t < start + note_len)
        note_t = t[mask] - start
        sub_t = sine_wave(freq, note_t)
        env = adsr_envelope(note_t, 0.3, 0.5, 0.2, 1.5)
        sub[mask] += sub_t * env * 0.1
    sub = lowpass(sub, 180)
    audio += sub

    # Subtle texture noise
    texture = np.random.randn(len(t))
    texture = lowpass(texture, 8000)
    audio += texture * 0.004

    audio_left = audio
    audio_right = np.roll(audio, int(30 / 1000 * SAMPLE_RATE))
    audio_right[:int(30 / 1000 * SAMPLE_RATE)] = 0

    audio_left = np.tanh(audio_left * 1.1) * 0.92
    audio_right = np.tanh(audio_right * 1.1) * 0.92

    return audio_left, audio_right


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    generators = [
        ('energetic-upbeat-01', generate_energetic_upbeat_01),
        ('energetic-upbeat-02', generate_energetic_upbeat_02),
        ('calm-relax-01', generate_calm_relax_01),
        ('calm-relax-02', generate_calm_relax_02),
        ('dramatic-impact-01', generate_dramatic_impact_01),
        ('playful-cute-01', generate_playful_cute_01),
        ('inspirational-uplift-01', generate_inspirational_uplift_01),
        ('fashion-trend-01', generate_fashion_trend_01),
        ('beauty-elegant-01', generate_beauty_elegant_01),
        ('beauty-elegant-02', generate_beauty_elegant_02),
    ]

    for name, gen_func in generators:
        print(f'Generating {name}...')
        audio_l, audio_r = gen_func()
        wav_path = os.path.join(OUTPUT_DIR, f'{name}.wav')
        mp3_path = os.path.join(OUTPUT_DIR, f'{name}.mp3')
        save_wav(wav_path, audio_l, audio_r)
        convert_to_mp3(wav_path, mp3_path)
        os.remove(wav_path)  # Clean up WAV
        size_kb = os.path.getsize(mp3_path) / 1024
        print(f'  {name}.mp3 generated: {size_kb:.1f} KB')

    print('\nAll BGM files generated successfully!')


if __name__ == '__main__':
    main()
