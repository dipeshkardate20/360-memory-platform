from __future__ import annotations

import json
import os

from flask import Flask, jsonify, make_response, request
from werkzeug.exceptions import RequestEntityTooLarge

from stitcher import MAX_FILE_BYTES, MAX_PHOTOS, MAX_REQUEST_BYTES, StitchError, stitch_images


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES


@app.get("/health")
def health():
    return jsonify(status="ok", engine="opencv", projection="partial_panorama")


@app.post("/stitch")
def stitch():
    uploads = request.files.getlist("images")
    if len(uploads) < 2:
        return jsonify(error="Add at least two overlapping photos."), 400
    if len(uploads) > MAX_PHOTOS:
        return jsonify(error=f"Choose no more than {MAX_PHOTOS} photos at a time."), 400

    try:
        panorama, warnings = stitch_images([upload.read(MAX_FILE_BYTES + 1) for upload in uploads])
    except StitchError as error:
        return jsonify(error=str(error)), 422

    response = make_response(panorama)
    response.headers["Content-Type"] = "image/jpeg"
    response.headers["Content-Disposition"] = 'inline; filename="partial-panorama.jpg"'
    response.headers["X-Projection-Type"] = "partial_panorama"
    response.headers["X-Image-Count"] = str(len(uploads))
    response.headers["X-Stitch-Warnings"] = json.dumps(warnings)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(RequestEntityTooLarge)
def too_large(_error):
    return jsonify(error="The selected photos exceed the request size limit."), 413


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    app.run(host="127.0.0.1", port=port, debug=False)
