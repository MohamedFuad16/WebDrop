from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "icons"
OUTPUT_DIR = SOURCE_DIR / "animated"
X_REGIONS = ((0, 535), (535, 1005), (1005, 1536))
Y_REGIONS = ((0, 512), (512, 1024))


def circle_box(image_array, x0, y0, x1, y1):
    region = image_array[y0:y1, x0:x1].astype(float)
    channel_max = region.max(axis=2)
    channel_min = region.min(axis=2)
    channel_mean = region.mean(axis=2)
    pastel = (
        (channel_max - channel_min > 8)
        & (channel_max - channel_min < 95)
        & (channel_mean > 165)
    )
    ys, xs = np.nonzero(pastel)
    left, right = np.percentile(xs, (0.5, 99.5))
    top, bottom = np.percentile(ys, (0.5, 99.5))
    center_x = x0 + (left + right) / 2
    center_y = y0 + (top + bottom) / 2
    side = max(right - left, bottom - top) + 8
    return center_x, center_y, side


def masked_frame(source, center_x, center_y, side):
    size = int(round(side))
    left = int(round(center_x - size / 2))
    top = int(round(center_y - size / 2))
    frame = source.crop((left, top, left + size, top + size)).convert("RGBA")

    mask = Image.new("L", (size * 4, size * 4), 0)
    draw = ImageDraw.Draw(mask)
    inset = 5 * 4
    draw.ellipse((inset, inset, size * 4 - inset, size * 4 - inset), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.4)).resize((size, size), Image.Resampling.LANCZOS)
    frame.putalpha(ImageChops.multiply(frame.getchannel("A"), mask))
    return frame.resize((320, 320), Image.Resampling.LANCZOS)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for user_index in range(1, 9):
        source_path = SOURCE_DIR / f"user_{user_index}.png"
        source = Image.open(source_path).convert("RGB")
        image_array = np.asarray(source)
        user_dir = OUTPUT_DIR / f"user-{user_index}"
        user_dir.mkdir(parents=True, exist_ok=True)

        frame_index = 1
        for y0, y1 in Y_REGIONS:
            for x0, x1 in X_REGIONS:
                center_x, center_y, side = circle_box(image_array, x0, y0, x1, y1)
                frame = masked_frame(source, center_x, center_y, side)
                frame.save(user_dir / f"frame-{frame_index}.png", optimize=True)
                frame_index += 1

    print(f"Built 48 avatar frames in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
