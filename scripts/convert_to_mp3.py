#!/usr/bin/env python3
"""Convert audio file (WAV/etc) to MP3 using lameenc — no ffmpeg required."""

import sys
import os
import numpy as np


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 convert_to_mp3.py <input_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    import soundfile as sf
    import lameenc

    # Read audio
    data, sr = sf.read(input_path)

    # Convert to int16 for MP3 encoding
    if data.dtype == np.float32 or data.dtype == np.float64:
        data = (data * 32767).astype(np.int16)

    # Handle stereo/mono
    if len(data.shape) == 1:
        # Mono: duplicate to stereo
        data = np.column_stack([data, data])
    elif data.shape[1] > 2:
        # Take first two channels
        data = data[:, :2]

    # Interleave stereo channels
    interleaved = data.flatten().astype(np.int16)

    # Encode to MP3
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(192)  # 192 kbps
    encoder.set_in_sample_rate(sr)
    encoder.set_channels(2)
    encoder.set_quality(2)  # High quality

    mp3_data = encoder.encode(interleaved.tobytes())
    mp3_data += encoder.flush()

    # Write output
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(mp3_data)


if __name__ == "__main__":
    main()
