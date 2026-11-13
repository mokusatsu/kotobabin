"""Original deterministic synthesis for the seven canonical sound candidates.

No samples or third party recordings. Requires numpy, scipy and ffmpeg.
Masters: 48 kHz, 24 bit PCM. Published theme: gapless Ogg/MP3.
Run from the repository root. Listening acceptance remains a separate review.
"""
from pathlib import Path
import json
import subprocess
import wave

import numpy as np
from scipy.signal import butter, sosfilt

RATE = 48_000
OUT = Path('public/assets/sound_effect')
MASTERS = Path('public/assets/originals/audio')
OUT.mkdir(parents=True, exist_ok=True)
MASTERS.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261113)


def tone(duration, frequency, level=1.0):
    t = np.arange(round(duration * RATE)) / RATE
    attack = 1 - np.exp(-t / 0.004)
    release = np.minimum(1, np.maximum(0, (duration - t) / 0.025)) ** 2
    return level * attack * np.exp(-t / max(0.03, duration * .30)) * release * (
        np.sin(2 * np.pi * frequency * t)
        + .19 * np.sin(2 * np.pi * frequency * 2 * t)
        + .045 * np.sin(2 * np.pi * frequency * 3 * t))


def paper(duration, level=.1):
    t = np.arange(round(duration * RATE)) / RATE
    noise = sosfilt(butter(2, [250, 2400], 'bandpass', fs=RATE, output='sos'), rng.normal(0, 1, t.size))
    return level * noise * (1 - np.exp(-t / .0015)) * np.exp(-t / .014) * np.minimum(1, (duration - t) / .01)


def add(target, sound, start, level=1.0):
    offset = round(start * RATE)
    available = min(len(sound), len(target) - offset)
    target[offset:offset + available] += sound[:available] * level


def wav24(path, signal):
    signal = np.asarray(signal)
    channels = 1 if signal.ndim == 1 else signal.shape[1]
    assert np.max(np.abs(signal)) < 1
    ints = np.rint(signal.reshape(-1) * 8_388_607).astype(np.int32)
    packed = np.column_stack((ints & 255, (ints >> 8) & 255, (ints >> 16) & 255)).astype('uint8')
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(3)
        wav.setframerate(RATE)
        wav.writeframes(packed.tobytes())


sounds = {'audio_key': paper(.08, .30),
          'audio_word': paper(.15, .18) + tone(.15, 660, .20),
          'audio_mistake': tone(.1, 220, .12)}
for name, duration, notes in [
    ('audio_dispatch_small', .25, [(0.035, 523.251)]),
    ('audio_dispatch_medium', .35, [(0.025, 523.251), (.13, 659.255)]),
    ('audio_dispatch_full', .45, [(0.025, 523.251), (.125, 659.255), (.225, 783.991)]),
]:
    sound = paper(duration, .22)
    for onset, frequency in notes:
        add(sound, tone(duration - onset, frequency), onset, .20)
    sounds[name] = sound

report = {}
for name, sound in sounds.items():
    wav24(OUT / f'{name}.wav', sound)
    report[name] = {'frames': len(sound), 'seconds': len(sound) / RATE,
                    'channels': 1, 'sample_rate': RATE, 'bit_depth': 24,
                    'peak_dbfs': round(20 * np.log10(np.max(np.abs(sound))), 2)}

# 80 BPM, 4/4, sixteen bars. Circular mixing carries the final pluck's
# decay across the boundary rather than inserting silence or a fade to black.
theme = np.zeros((48 * RATE, 2))
chords = [(48, 52, 55), (45, 48, 52), (41, 45, 48), (43, 47, 50),
          (48, 52, 55), (40, 43, 47), (41, 45, 48), (43, 47, 50)] * 2
melody = [76, 72, 76, 79, 77, 76, 74, 71, 72, 76, 79, 76, 77, 72, 74, 71]


def circular_note(at, midi, level, pan, duration):
    sound = tone(duration, 440 * 2 ** ((midi - 69) / 12), level)
    indices = (round(at * RATE) + np.arange(len(sound))) % len(theme)
    theme[indices, 0] += sound * np.sqrt((1 - pan) / 2)
    theme[indices, 1] += sound * np.sqrt((1 + pan) / 2)


for bar, chord in enumerate(chords):
    for beat, midi in enumerate([chord[0], chord[1] + 12, chord[2], chord[1] + 12]):
        circular_note(bar * 3 + beat * .75, midi, .09, -.2, 1.7)
    circular_note(bar * 3 + .75, melody[bar], .067, .2, 1.8)
    if bar % 4 == 3:
        circular_note(bar * 3 + 2.25, melody[bar] - 2, .043, .15, 1.8)
wav24(MASTERS / 'audio_theme.wav', theme)
for extension, args in [('ogg', ['-c:a', 'libvorbis', '-q:a', '4']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '128k'])]:
    target = OUT / f'audio_theme.{extension}'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(MASTERS / 'audio_theme.wav'), *args, str(target)], check=True)
    decoded = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(target), '-f', 'f32le', '-acodec', 'pcm_f32le', '-'])
    values = np.frombuffer(decoded, dtype='<f4').reshape(-1, 2)
    assert len(values) == RATE * 48, f'{extension}: unexpected decoded duration'
    report[f'audio_theme.{extension}'] = {'frames': len(values), 'seconds': len(values) / RATE,
        'channels': 2, 'loop_boundary_step': float(np.max(np.abs(values[-1] - values[0]))),
        'peak_dbfs': round(float(20 * np.log10(np.max(np.abs(values)))), 2)}
Path('work').mkdir(exist_ok=True)
Path('work/audio-candidate-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
