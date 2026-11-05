import { useCallback, useEffect, useRef, useState } from 'react';
import RotationTracker from './RotationTracker.jsx';

const angleDifference = (left, right) => ((left - right + 540) % 360) - 180;

function captureGuidance(count) {
  if (count === 0) return 'Point forward to begin';
  if (count < 4) return 'Rotate a little to the right';
  if (count < 8) return 'Keep turning with plenty of overlap';
  if (count < 12) return 'Continue around to close the sweep';
  if (count < 14) return 'Switch to manual for an upper view';
  if (count < 16) return 'Switch to manual for a lower view';
  return 'Coverage looks good — add any missed angles';
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    camera: <><path d="M14 5h-4l-2 2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.4L20 12M4 12l2 5.6A7 7 0 0 0 18.4 15"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const frameTimerRef = useRef(null);
  const sensorTimeoutRef = useRef(null);
  const sensorSamplesRef = useRef([]);
  const captureRef = useRef(null);
  const visualStableRef = useRef(false);
  const currentYawRef = useRef(null);
  const lastCapturedYawRef = useRef(null);
  const stableSinceRef = useRef(null);
  const autoCaptureLockRef = useRef(false);
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [retakeId, setRetakeId] = useState(null);
  const [title, setTitle] = useState('A little piece of here');
  const [captureMode, setCaptureMode] = useState('manual');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoHint, setAutoHint] = useState('Enable automatic capture to begin');
  const photoCountRef = useRef(0);
  photoCountRef.current = photos.length;

  const stopCamera = useCallback(() => {
    setAutoEnabled(false);
    setCaptureMode('manual');
    clearTimeout(sensorTimeoutRef.current);
    clearInterval(frameTimerRef.current);
    sensorSamplesRef.current = [];
    visualStableRef.current = false;
    lastCapturedYawRef.current = null;
    currentYawRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    clearTimeout(sensorTimeoutRef.current);
    clearInterval(frameTimerRef.current);
  }, []);

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser. Open this page over HTTPS or on localhost, or add photos from your device.');
      return false;
    }
    setCameraState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('active');
      return true;
    } catch (error) {
      const messages = {
        NotAllowedError: 'Camera permission was blocked. Allow camera access in your browser settings and try again.',
        NotFoundError: 'No camera was found. You can still add photos from your device.',
        NotReadableError: 'Your camera is being used by another app. Close that app and try again.',
      };
      setCameraError(messages[error.name] || 'The camera could not be started. Check your browser permissions and try again.');
      setCameraState('idle');
      return false;
    }
  };

  const capture = (onCaptured) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const image = { id: crypto.randomUUID(), url: URL.createObjectURL(blob), blob, createdAt: Date.now() };
      if (retakeId) {
        setPhotos((current) => {
          const old = current.find((photo) => photo.id === retakeId);
          if (old) URL.revokeObjectURL(old.url);
          return current.map((photo) => photo.id === retakeId ? image : photo);
        });
        setRetakeId(null);
      } else {
        setPhotos((current) => [...current, image]);
      }
      onCaptured?.();
    }, 'image/jpeg', 0.92);
  };
  captureRef.current = capture;

  const enableAutomaticCapture = async () => {
    setCameraError('');
    if (retakeId) {
      setCameraError('Finish this retake with the manual shutter first.');
      return;
    }
    if (!('DeviceOrientationEvent' in window)) {
      setCameraError('This browser does not provide device orientation. Manual capture is ready to use.');
      return;
    }
    try {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await window.DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('permission');
      }
      if (cameraState !== 'active') {
        const started = await startCamera();
        if (!started) return;
      }
      setCaptureMode('automatic');
      setAutoEnabled(true);
      setAutoHint('Hold the phone steady to find your starting angle');
      sensorSamplesRef.current = [];
      lastCapturedYawRef.current = null;
      currentYawRef.current = null;
      stableSinceRef.current = null;
      sensorTimeoutRef.current = window.setTimeout(() => {
        if (sensorSamplesRef.current.length === 0) {
          setAutoEnabled(false);
          setCaptureMode('manual');
          setCameraError('No usable orientation readings came through. Automatic capture is unavailable here; use the manual shutter.');
        }
      }, 3500);
    } catch (error) {
      setCaptureMode('manual');
      setAutoEnabled(false);
      setCameraError(error.message === 'permission' ? 'Sensor permission was declined. Use manual capture or allow motion access in browser settings.' : 'Automatic capture could not start. Manual capture is ready to use.');
    }
  };

  const useManualCapture = () => {
    setCaptureMode('manual');
    setAutoEnabled(false);
    clearTimeout(sensorTimeoutRef.current);
    clearInterval(frameTimerRef.current);
    sensorSamplesRef.current = [];
    lastCapturedYawRef.current = null;
    autoCaptureLockRef.current = false;
    setAutoHint('Manual capture is ready');
  };

  useEffect(() => {
    if (!autoEnabled || cameraState !== 'active') return undefined;

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 32;
    frameCanvas.height = 24;
    const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
    let previousFrame = null;
    let stillFrames = 0;
    frameTimerRef.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !frameContext) return;
      frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
      const pixels = frameContext.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data;
      if (previousFrame) {
        let difference = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          difference += Math.abs(pixels[index] - previousFrame[index]);
          difference += Math.abs(pixels[index + 1] - previousFrame[index + 1]);
          difference += Math.abs(pixels[index + 2] - previousFrame[index + 2]);
        }
        const averageDifference = difference / (frameCanvas.width * frameCanvas.height * 3);
        stillFrames = averageDifference < 8 ? stillFrames + 1 : 0;
        visualStableRef.current = stillFrames >= 3;
      }
      previousFrame = new Uint8ClampedArray(pixels);
    }, 250);

    const onOrientation = (event) => {
      if (event.alpha == null || event.beta == null || event.gamma == null) return;
      currentYawRef.current = event.alpha;
      clearTimeout(sensorTimeoutRef.current);
      const reading = { alpha: event.alpha, beta: event.beta, gamma: event.gamma, time: Date.now() };
      const samples = [...sensorSamplesRef.current, reading].slice(-7);
      sensorSamplesRef.current = samples;
      if (samples.length < 7) {
        setAutoHint('Hold steady while the phone finds its direction');
        return;
      }
      const first = samples[0];
      const spreads = [
        Math.max(...samples.map((sample) => Math.abs(angleDifference(sample.alpha, first.alpha)))),
        Math.max(...samples.map((sample) => Math.abs(sample.beta - first.beta))),
        Math.max(...samples.map((sample) => Math.abs(sample.gamma - first.gamma))),
      ];
      const orientationStable = spreads.every((spread) => spread < 2.4);
      if (!orientationStable) {
        stableSinceRef.current = null;
        setAutoHint('Hold steady — checking the camera view');
        return;
      }
      stableSinceRef.current ??= Date.now();
      const yaw = event.alpha;
      const enoughTurn = lastCapturedYawRef.current == null || Math.abs(angleDifference(yaw, lastCapturedYawRef.current)) >= 24;
      if (!enoughTurn) {
        setAutoHint('Rotate slowly to a new angle');
        return;
      }
      if (!visualStableRef.current || Date.now() - stableSinceRef.current < 900) {
        setAutoHint('Hold steady — checking the camera view');
        return;
      }
      if (autoCaptureLockRef.current) return;
      autoCaptureLockRef.current = true;
      lastCapturedYawRef.current = yaw;
      setAutoHint('Steady — capturing this angle');
      captureRef.current?.(() => {
        window.setTimeout(() => {
          autoCaptureLockRef.current = false;
          if (photoCountRef.current >= 12) {
            setAutoEnabled(false);
            setCaptureMode('manual');
            setAutoHint('Horizontal sweep captured. Use manual mode for upper and lower views');
          } else {
            setAutoHint('Captured. Rotate slowly to the next angle');
          }
        }, 700);
      });
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      clearInterval(frameTimerRef.current);
    };
  }, [autoEnabled, cameraState]);

  const removePhoto = (id) => {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return current.filter((item) => item.id !== id);
    });
    if (retakeId === id) setRetakeId(null);
  };

  const addFiles = (files) => {
    const valid = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    setPhotos((current) => [...current, ...valid.map((blob) => ({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), createdAt: Date.now() }))]);
  };

  const beginRetake = (id) => {
    useManualCapture();
    setRetakeId(id);
    if (cameraState !== 'active') startCamera();
  };

  const manualShutter = () => {
    if (autoEnabled && currentYawRef.current != null) lastCapturedYawRef.current = currentYawRef.current;
    capture();
  };

  const progress = Math.min(100, Math.round((photos.length / 16) * 100));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Still Here home"><span className="brand-mark"><span /></span><span>still here<span className="brand-dot">.</span></span></a>
        <div className="topbar-right"><span className="save-note"><Icon name="shield" size={15} /> Captures stay in this tab</span><button className="icon-button" aria-label="Jump to captures" onClick={() => document.getElementById('captures')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="grid" /></button></div>
      </header>

      <section className="workspace" id="top">
        <div className="capture-column">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR SPACE, YOUR STORY <span className="eyebrow-line" /></div>
          <div className="heading-row"><div><h1>Be here.<br/><em>Remember it.</em></h1><p className="intro">A few moments, captured from every angle.<br className="desktop-break"/> Your memory starts right here.</p></div><div className="step-pill"><span className="step-dot"/> STEP 01 <span className="step-divider"/> CAPTURE</div></div>

          <div className={`camera-frame ${cameraState === 'active' ? 'camera-live' : ''}`}>
            <video ref={videoRef} className="camera-video" playsInline muted aria-label="Live camera preview" />
            {cameraState !== 'active' && <div className="camera-placeholder">
              <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
              <div className="camera-illustration"><Icon name="camera" size={31}/><span className="camera-spark spark-one"/><span className="camera-spark spark-two"/></div>
              <div className="placeholder-title">Your view goes here</div>
              <div className="placeholder-subtitle">Find a spot. Stay in place. Look all around.</div>
              <button className="start-camera" onClick={startCamera} disabled={cameraState === 'starting'}><Icon name="camera" size={17}/>{cameraState === 'starting' ? 'Waking up camera…' : 'Turn on camera'}<Icon name="arrow" size={16}/></button>
              <div className="privacy-note"><Icon name="shield" size={14}/> Your photos stay right here for now</div>
            </div>}
            {cameraState === 'active' && <>
              <div className="viewfinder viewfinder-tl"/><div className="viewfinder viewfinder-tr"/><div className="viewfinder viewfinder-bl"/><div className="viewfinder viewfinder-br"/>
              <div className="camera-live-top"><span className="live-badge"><span/> LIVE</span><button className="camera-close" onClick={stopCamera} aria-label="Turn off camera"><Icon name="close"/></button></div>
              <div className="camera-guide"><span className="guide-spark">✳</span><span>{retakeId ? 'Frame your retake' : autoEnabled ? autoHint : captureGuidance(photos.length)}</span></div>
              <div className="camera-controls"><button className="shutter" onClick={manualShutter} aria-label={retakeId ? 'Retake photo' : 'Capture photo'}><span/></button><span className="shutter-hint">{retakeId ? 'RETAKE PHOTO' : autoEnabled ? 'MANUAL OVERRIDE' : 'TAP TO CAPTURE'}</span></div>
            </>}
            {cameraError && <div className="camera-error" role="alert"><span>{cameraError}</span><button onClick={() => setCameraError('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
            <div className="frame-bottom"><span>CAMERA PREVIEW</span><span>01 <i>/</i> 02</span></div>
          </div>

          <RotationTracker />
          <div className="capture-tools"><div className="mode-area"><div className="mode-switch" role="group" aria-label="Capture mode"><button className={captureMode === 'manual' ? 'mode-choice selected' : 'mode-choice'} aria-pressed={captureMode === 'manual'} onClick={useManualCapture}>Manual</button><button className={captureMode === 'automatic' ? 'mode-choice selected' : 'mode-choice'} aria-pressed={captureMode === 'automatic'} onClick={enableAutomaticCapture} disabled={Boolean(retakeId)} title={retakeId ? 'Retakes use the manual shutter' : undefined}>Automatic</button></div><div className="mode-caption"><strong>{captureMode === 'automatic' ? 'Automatic capture' : 'Manual capture'}</strong><small>{captureMode === 'automatic' ? autoHint : 'Take each photo when you’re ready'}</small></div></div><button className="add-photos" onClick={() => fileRef.current?.click()}>Add photos <span>＋</span></button><input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}/></div>
        </div>

        <aside className="side-column">
          <div className="memory-card">
            <div className="card-heading"><span className="card-kicker">YOUR MEMORY</span><span className="draft-tag"><span/> DRAFT</span></div>
            <label className="title-label" htmlFor="memory-title">Give this moment a name</label>
            <input id="memory-title" className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80}/>
            <div className="title-underline"/>
            <div className="progress-block"><div className="progress-heading"><span>Photo collection</span><strong>{photos.length} <small>photos</small></strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }}/></div><div className="progress-caption"><span>{photos.length < 12 ? 'A few more angles make a fuller memory' : 'Lovely coverage — keep going if you like'}</span><span>~16</span></div></div>
            <div className="coverage-note"><span className="coverage-icon">✳</span><span>Small turns, lots of overlap.<br/>Keep your feet in one place.</span></div>
          </div>

          <div className="gallery-section" id="captures"><div className="gallery-heading"><div><span className="card-kicker">THE MOMENTS</span><h2>Your captures <span>{photos.length}</span></h2></div><button className="clear-button" onClick={() => photos.forEach((photo) => removePhoto(photo.id))} disabled={!photos.length}>Clear all</button></div>
            {photos.length === 0 ? <div className="empty-gallery"><div className="empty-icon"><Icon name="camera" size={21}/></div><div><strong>Nothing captured yet</strong><span>Your photos will find a home here.</span></div></div> : <div className="thumbnail-grid">{photos.map((photo, index) => <div className="photo-tile" key={photo.id}><img src={photo.url} alt={`Capture ${index + 1}`}/><span className="photo-number">{String(index + 1).padStart(2, '0')}</span><div className="tile-actions"><button onClick={() => beginRetake(photo.id)} title="Retake this photo" aria-label={`Retake photo ${index + 1}`}><Icon name="refresh" size={14}/></button><button onClick={() => removePhoto(photo.id)} title="Delete photo" aria-label={`Delete photo ${index + 1}`}><Icon name="trash" size={14}/></button></div></div>)}</div>}
          </div>

          <div className="next-step"><div className="next-step-top"><span className="card-kicker">UP NEXT</span><span className="next-number">02</span></div><div className="next-step-title">Stitch your<br/><em>surroundings.</em></div><div className="next-step-bottom"><span>Ready when you are</span><span className="next-arrow"><Icon name="arrow" size={17}/></span></div><button className="stitch-button" disabled title="Uploading and stitching are added in a later phase">Continue to stitching <Icon name="arrow" size={16}/></button><small className="phase-hint">Upload and stitching arrive in the next phase</small></div>
        </aside>
      </section>
      <footer className="footer"><span>MADE FOR THE MOMENTS THAT MATTER</span><span>360° MEMORY STUDIO <i>·</i> 2026</span></footer>
    </main>
  );
}
