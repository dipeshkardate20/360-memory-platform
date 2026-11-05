from __future__ import annotations

from io import BytesIO

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


MAX_PHOTOS = 24
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_REQUEST_BYTES = 220 * 1024 * 1024
MAX_IMAGE_PIXELS = 60_000_000
MAX_EDGE = 2200
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class StitchError(ValueError):
    """A user-correctable image or stitching error."""


def _decode_image(payload: bytes, index: int) -> tuple[np.ndarray, float]:
    if not payload:
        raise StitchError(f"Photo {index} is empty.")
    if len(payload) > MAX_FILE_BYTES:
        raise StitchError(f"Photo {index} is larger than the 24 MB limit.")

    try:
        with Image.open(BytesIO(payload)) as image:
            image_format = (image.format or "").upper()
            if image_format not in ALLOWED_FORMATS:
                raise StitchError(f"Photo {index} must be a JPEG, PNG, or WebP image.")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise StitchError(f"Photo {index} has too many pixels to process safely.")
            image = ImageOps.exif_transpose(image).convert("RGB")
            if image.width < 200 or image.height < 150:
                raise StitchError(f"Photo {index} is too small. Use images at least 200 × 150 pixels.")
            image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            rgb = np.asarray(image, dtype=np.uint8)
    except StitchError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise StitchError(f"Photo {index} is not a readable image.") from error

    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return bgr, sharpness


def stitch_images(payloads: list[bytes]) -> tuple[bytes, list[str]]:
    if len(payloads) < 2:
        raise StitchError("Add at least two overlapping photos to create a panorama.")
    if len(payloads) > MAX_PHOTOS:
        raise StitchError(f"Choose no more than {MAX_PHOTOS} photos at a time.")

    frames: list[np.ndarray] = []
    soft_photos: list[int] = []
    for index, payload in enumerate(payloads, start=1):
        frame, sharpness = _decode_image(payload, index)
        frames.append(frame)
        if sharpness < 25:
            soft_photos.append(index)

    stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
    status, panorama = stitcher.stitch(frames)
    if status != cv2.Stitcher_OK or panorama is None:
        status_messages = {
            cv2.Stitcher_ERR_NEED_MORE_IMGS: "OpenCV could not find enough usable photos. Add more overlapping views.",
            cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "The photos could not be aligned. Retake them with more overlap and less movement between shots.",
            cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "The photos could not be aligned reliably. Try a smaller set with clearer overlap.",
        }
        raise StitchError(status_messages.get(status, f"Stitching failed with OpenCV status {status}. Try another set of overlapping photos."))

    if panorama.shape[1] * panorama.shape[0] > 100_000_000:
        raise StitchError("The stitched result is too large to return. Try fewer or smaller photos.")

    encoded, data = cv2.imencode(".jpg", panorama, [cv2.IMWRITE_JPEG_QUALITY, 94])
    if not encoded:
        raise StitchError("OpenCV created a panorama but could not encode the output image.")

    warnings = []
    if soft_photos:
        numbers = ", ".join(str(number) for number in soft_photos)
        warnings.append(f"Photos {numbers} look soft; sharpness may be reduced in those areas.")
    warnings.append("This is a partial panorama. It is not a complete spherical 360° image.")
    return data.tobytes(), warnings
