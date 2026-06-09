#!/usr/bin/env python3
"""Audio enhancement using noisereduce — fast spectral gating with multi-pass."""

import sys
import os


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 enhance_audio_demucs.py <input_path> <output_path> <passes>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    passes = int(sys.argv[3]) if len(sys.argv) > 3 else 1

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    import warnings
    warnings.filterwarnings("ignore")

    print("PROGRESS:10 读取音频...", flush=True)

    import numpy as np
    import soundfile as sf
    from noisereduce import reduce_noise

    print(f"PROGRESS:20 开始降噪 ({passes} 遍)...", flush=True)

    data, sr = sf.read(input_path)

    # Convert to mono for processing if stereo
    if len(data.shape) > 1:
        mono = data.mean(axis=1)
    else:
        mono = data

    # Use first 2 seconds as noise profile
    noise_sample = mono[:sr * 2]

    # Multi-pass noise reduction
    result = mono
    for i in range(passes):
        pct = int(20 + (i / passes) * 65)
        print(f"PROGRESS:{pct} 第 {i + 1}/{passes} 遍处理中...", flush=True)
        # Use current result's quiet parts as noise profile for subsequent passes
        if i > 0:
            noise_sample = result[:sr * 2]
        result = reduce_noise(y=result, sr=sr, y_noise=noise_sample, prop_decrease=0.85, stationary=False)

    print("PROGRESS:85 保存音频...", flush=True)

    # If original was stereo, duplicate enhanced mono to both channels
    if len(data.shape) > 1:
        result = np.column_stack([result, result])

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    sf.write(output_path, result, sr)

    print("PROGRESS:100 完成", flush=True)


if __name__ == "__main__":
    main()
