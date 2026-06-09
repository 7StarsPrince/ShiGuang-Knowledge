#!/usr/bin/env python3
"""Audio enhancement using DeepFilterNet3 — noise reduction and voice extraction."""

import sys
import os


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 enhance_audio.py <input_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    import warnings
    warnings.filterwarnings("ignore")

    print("PROGRESS:5 加载模型...", flush=True)

    from df.enhance import enhance, init_df, load_audio, save_audio
    import torch

    print("PROGRESS:10 初始化 DeepFilterNet3...", flush=True)

    model, df_state, _ = init_df()

    print("PROGRESS:15 读取音频文件...", flush=True)

    audio, _ = load_audio(input_path, sr=df_state.sr())

    # Process audio in ~30s segments for smooth progress reporting
    sr = df_state.sr()
    segment_samples = 30 * sr
    total_samples = audio.shape[-1]
    num_segments = max(1, (total_samples + segment_samples - 1) // segment_samples)

    print(f"PROGRESS:20 开始处理 (共 {num_segments} 段)...", flush=True)

    if num_segments <= 1:
        enhanced = enhance(model, df_state, audio)
    else:
        chunks = []
        for i in range(num_segments):
            start = i * segment_samples
            end = min(start + segment_samples, total_samples)
            chunk = audio[..., start:end]
            enhanced_chunk = enhance(model, df_state, chunk)
            chunks.append(enhanced_chunk)
            pct = int(20 + (i + 1) / num_segments * 70)
            print(f"PROGRESS:{pct} 处理中 {i + 1}/{num_segments} 段", flush=True)
        enhanced = torch.cat(chunks, dim=-1)

    print("PROGRESS:92 保存增强音频...", flush=True)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    save_audio(output_path, enhanced, sr=sr)

    print("PROGRESS:100 完成", flush=True)


if __name__ == "__main__":
    main()
