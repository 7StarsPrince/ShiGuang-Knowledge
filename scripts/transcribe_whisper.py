#!/usr/bin/env python3
"""Transcribe audio using Whisper and output transcript_json-compatible format.
Uses soundfile to load audio, bypassing ffmpeg dependency."""

import sys
import os
import json


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 transcribe_whisper.py <input_audio_path> <output_json_path> <model_name>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    model_name = sys.argv[3] or "medium"

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    print("PROGRESS:5 Loading audio...", flush=True)

    import warnings
    warnings.filterwarnings("ignore")

    import numpy as np
    import soundfile as sf

    # Load audio with soundfile (no ffmpeg needed)
    data, sr = sf.read(input_path)
    # Convert to mono
    if len(data.shape) > 1:
        data = data.mean(axis=1)
    # Resample to 16kHz if needed
    target_sr = 16000
    if sr != target_sr:
        try:
            import resampy
            data = resampy.resample(data, sr, target_sr)
        except ImportError:
            if sr > target_sr and sr % target_sr == 0:
                step = sr // target_sr
                data = data[::step]
            else:
                duration = len(data) / sr
                new_len = int(duration * target_sr)
                indices = np.linspace(0, len(data) - 1, new_len)
                data = np.interp(indices, np.arange(len(data)), data)
        sr = target_sr

    audio_np = data.astype(np.float32)
    duration_sec = len(audio_np) / sr
    print(f"PROGRESS:10 Audio loaded ({duration_sec:.1f}s). Loading model {model_name}...", flush=True)

    import whisper

    model = whisper.load_model(model_name)

    print(f"PROGRESS:20 Model loaded. Transcribing {duration_sec:.0f}s of audio...", flush=True)

    # Monkey-patch whisper.audio.load_audio to bypass ffmpeg
    import whisper.audio
    _orig_load_audio = whisper.audio.load_audio
    _audio_data = audio_np
    def _patched_load_audio(path, sr=16000):
        return _audio_data
    whisper.audio.load_audio = _patched_load_audio

    result = model.transcribe("__dummy__", language="zh", verbose=False, word_timestamps=True)

    whisper.audio.load_audio = _orig_load_audio

    print("PROGRESS:85 Processing segments...", flush=True)

    # Convert to transcript_json format (compatible with iflyrec format)
    paragraphs = []
    for seg in result.get("segments", []):
        start_ms = int(seg["start"] * 1000)
        end_ms = int(seg["end"] * 1000)
        text = seg.get("text", "").strip()
        if not text:
            continue
        words = []
        for w in seg.get("words", []):
            wtext = w.get("word", "").strip()
            if wtext:
                words.append({
                    "text": wtext,
                    "time": [int(w.get("start", 0) * 1000), int(w.get("end", 0) * 1000)],
                    "wp": "n",
                })
        if not words:
            words.append({"text": text, "time": [start_ms, end_ms], "wp": "n"})
        paragraphs.append({
            "pTime": [start_ms, end_ms],
            "role": "1",
            "words": words,
        })

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(paragraphs, f, ensure_ascii=False, indent=2)

    print(f"PROGRESS:100 Done. {len(paragraphs)} segments.", flush=True)


if __name__ == "__main__":
    main()
