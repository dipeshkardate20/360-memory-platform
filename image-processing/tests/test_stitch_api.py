from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app  # noqa: E402


def make_overlapping_test_photos() -> tuple[bytes, bytes]:
    rng = np.random.default_rng(7)
    panorama = np.full((700, 1800, 3), 232, dtype=np.uint8)
    for index in range(420):
        x = int(rng.integers(0, panorama.shape[1]))
        y = int(rng.integers(0, panorama.shape[0]))
        color = tuple(int(value) for value in rng.integers(20, 225, size=3))
        radius = int(rng.integers(3, 18))
        cv2.circle(panorama, (x, y), radius, color, -1)
    for x in range(70, 1800, 125):
        cv2.line(panorama, (x, 0), (x, 700), (65, 75, 82), 2)
    for y in range(70, 700, 100):
        cv2.line(panorama, (0, y), (1800, y), (65, 75, 82), 2)

    def encode(crop: np.ndarray) -> bytes:
        success, output = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not success:
            raise RuntimeError('Could not create synthetic test image')
        return output.tobytes()

    return encode(panorama[:, :1100]), encode(panorama[:, 700:])


class StitchApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()

    def test_health_check(self) -> None:
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['engine'], 'opencv')

    def test_requires_two_images(self) -> None:
        response = self.client.post('/stitch', data={'images': (io.BytesIO(b'one'), 'one.jpg')})
        self.assertEqual(response.status_code, 400)

    def test_rejects_corrupt_image_data(self) -> None:
        response = self.client.post('/stitch', data={
            'images': [
                (io.BytesIO(b'not an image'), 'one.jpg'),
                (io.BytesIO(b'not an image'), 'two.jpg'),
            ],
        })
        self.assertEqual(response.status_code, 422)
        self.assertIn('not a readable image', response.json['error'])

    def test_stitches_overlapping_images_to_partial_jpeg(self) -> None:
        first, second = make_overlapping_test_photos()
        response = self.client.post('/stitch', data={
            'images': [
                (io.BytesIO(first), 'left.jpg'),
                (io.BytesIO(second), 'right.jpg'),
            ],
        })
        self.assertEqual(response.status_code, 200, response.get_json(silent=True))
        self.assertEqual(response.content_type, 'image/jpeg')
        self.assertEqual(response.headers['X-Projection-Type'], 'partial_panorama')
        self.assertTrue(response.data.startswith(b'\xff\xd8'))


if __name__ == '__main__':
    unittest.main()
