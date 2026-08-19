import io
import sys
from pathlib import Path

from PIL import Image, ImageOps


MAX_BYTES = 250 * 1024
MAX_DIMENSION = 1800


def save_under_limit(source_path: Path, output_path: Path) -> None:
    with Image.open(source_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        width, height = image.size
        if min(width, height) < 160 or max(width, height) / max(1, min(width, height)) > 6:
            raise RuntimeError("SKIP_NON_PRODUCT_IMAGE")
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

        for _ in range(8):
            for quality in (90, 84, 78, 72, 66, 58, 50, 42):
                buffer = io.BytesIO()
                image.save(buffer, format="WEBP", quality=quality, method=6)
                if buffer.tell() <= MAX_BYTES:
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    output_path.write_bytes(buffer.getvalue())
                    return

            width = max(320, round(image.width * 0.82))
            height = max(320, round(image.height * 0.82))
            if (width, height) == image.size:
                break
            image = image.resize((width, height), Image.Resampling.LANCZOS)

        raise RuntimeError(f"250KB以下へ縮小できませんでした: {source_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: compress_image.py INPUT OUTPUT")
    save_under_limit(Path(sys.argv[1]), Path(sys.argv[2]))
