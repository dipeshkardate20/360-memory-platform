# Still Here — 360° Memory Platform

A local-first prototype for capturing overlapping photos and creating a horizontal panorama. The rotation-degree tracker and automatic device-direction prompts have been removed. Capture is manual.

## Run the local stitching service

In one terminal, from the project folder:

```sh
cd image-processing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

The OpenCV service listens on `http://127.0.0.1:8001`. `GET /health` reports service status and `POST /stitch` accepts multiple `images` form fields. The service validates each file, warns about soft images, and returns the stitched JPEG. It keeps no uploaded files or panorama on disk.

## Run the website

In a second terminal, from the project folder:

```sh
npm install
npm run dev
```

The Vite development server proxies `/stitch-api` to the local Python service. Open the Vite URL, capture or add at least two overlapping JPEG, PNG, or WebP photos, then choose **Stitch panorama**. You can preview or download the result. Both services must be running.

## Connect the Vercel site to a hosted stitcher

Vercel's function request and response bodies are limited to 4.5 MB, which is too small for a set of phone photos. Host the Python service separately, for example as a Render Web Service:

1. Create a web service from this repository and set its **Root Directory** to `image-processing`.
2. Use build command `pip install -r requirements.txt` and start command `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 180`.
3. Set the service environment variable `FRONTEND_ORIGINS` to your exact Vercel origin, such as `https://your-project.vercel.app`.
4. Copy the service's public URL. In Vercel, add `VITE_STITCH_API_URL` with that URL, then redeploy the frontend.

The Vercel build sends stitch requests directly to that service. For hobby testing, Render's free service sleeps after 15 minutes idle and can take about a minute to wake; image stitching may need a larger instance for bigger photo sets. The local Vite proxy remains the default when `VITE_STITCH_API_URL` is blank.

Camera access requires `localhost` or HTTPS and browser permission. Photos stay in the browser until submitted to the local service. The service limits requests to 24 photos, 16 MB per photo, and 220 MB total.

## Stitching scope

OpenCV attempts a feature-based horizontal panorama. Scenes with little detail, too little overlap, blur, or camera movement can fail to align. A horizontal result is labeled a partial panorama; this prototype does not claim complete spherical coverage. Persistent image storage, saved memories, Java/Spring APIs, and PostgreSQL remain later phases.

Run the Python service checks with `image-processing/.venv/bin/python -m unittest discover -s image-processing/tests -v`, and create the frontend production bundle with `npm run build`.
