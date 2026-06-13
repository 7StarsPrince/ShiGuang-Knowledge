#!/usr/bin/env python3
"""Render selected pages of a PDF to PNG images using PyMuPDF.

Usage:
    python3 render-pdf-pages.py <pdf_path> <output_dir> <page_indices_json> [dpi]

Example:
    python3 render-pdf-pages.py paper.pdf /tmp/out "[0, 1]" 150

Output (stdout): JSON array of absolute PNG file paths.
"""
import json
import os
import sys
import fitz  # PyMuPDF


def render_pages(pdf_path: str, output_dir: str, page_indices: list[int], dpi: int = 150) -> list[str]:
    doc = fitz.open(pdf_path)
    os.makedirs(output_dir, exist_ok=True)
    paths: list[str] = []
    for idx in page_indices:
        if idx < 0 or idx >= doc.page_count:
            continue
        page = doc.load_page(idx)
        pix = page.get_pixmap(dpi=dpi)
        out_path = os.path.join(output_dir, f"page_{idx}.png")
        pix.save(out_path)
        paths.append(out_path)
    return paths


if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: render-pdf-pages.py <pdf_path> <output_dir> <page_indices_json> [dpi]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    page_indices = json.loads(sys.argv[3])
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 150

    try:
        paths = render_pages(pdf_path, output_dir, page_indices, dpi)
        print(json.dumps(paths))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
