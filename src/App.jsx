import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [retakeId, setRetakeId] = useState(null);
  const [title, setTitle] = useState('A little piece of here');
  const [stitching, setStitching] = useState(false);

  // how are you mother fcker 
  const [stitchError, setStitchError] = useState('');
  const [stitchResult, setStitchResult] = useState(null);
  const photoRevisionRef = useRef(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => {
    if (stitchResult?.url) URL.revokeObjectURL(stitchResult.url);
  }, [stitchResult]);

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

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const image = { id: crypto.randomUUID(), url: URL.createObjectURL(blob), blob, createdAt: Date.now() };
      photoRevisionRef.current += 1;
      setStitchResult(null);
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
    }, 'image/jpeg', 0.92);
  };

  const removePhoto = (id) => {
    photoRevisionRef.current += 1;
    setStitchResult(null);
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return current.filter((item) => item.id !== id);
    });
    if (retakeId === id) setRetakeId(null);
  };

  const addFiles = (files) => {
    const selected = Array.from(files || []);
    const valid = selected.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (valid.length !== selected.length) setStitchError('Use JPEG, PNG, or WebP photos for local stitching.');
    if (valid.length) {
      photoRevisionRef.current += 1;
      setStitchResult(null);
    }
    setPhotos((current) => [...current, ...valid.map((blob) => ({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), createdAt: Date.now() }))]);
  };

  const stitchPhotos = async () => {
    if (photos.length < 2 || stitching) return;
    const revision = photoRevisionRef.current;
    const formData = new FormData();
    photos.forEach((photo, index) => formData.append('images', photo.blob, `capture-${String(index + 1).padStart(2, '0')}.jpg`));
    setStitching(true);
    setStitchError('');
    setStitchResult(null);
    try {
      const stitchApiBase = (import.meta.env.VITE_STITCH_API_URL || '/stitch-api').replace(/\/+$/, '');
      const response = await fetch(`${stitchApiBase}/stitch`, { method: 'POST', body: formData });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        if (response.status >= 500) throw new Error('Could not reach the local stitching service. Start the Python service, then try again.');
        throw new Error(problem.error || `Stitching failed (${response.status}).`);
      }
      const blob = await response.blob();
      if (photoRevisionRef.current !== revision) throw new Error('The photo set changed during stitching. Please run it again.');
      const warnings = response.headers.get('X-Stitch-Warnings');
      setStitchResult({
        url: URL.createObjectURL(blob),
        imageCount: Number(response.headers.get('X-Image-Count') || photos.length),
        projection: response.headers.get('X-Projection-Type') || 'partial_panorama',
        warnings: warnings ? JSON.parse(warnings) : [],
      });
    } catch (error) {
      setStitchError(error.message.includes('Failed to fetch')
        ? 'Could not reach the local stitching service. Start the Python service, then try again.'
        : error.message);
    } finally {
      setStitching(false);
    }
  };

  const beginRetake = (id) => {
    setRetakeId(id);
    if (cameraState !== 'active') startCamera();
  };

  const manualShutter = () => capture();

  const progress = Math.min(100, Math.round((photos.length / 12) * 100));

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
              <div className="camera-guide"><span className="guide-spark">✳</span><span>{retakeId ? 'Frame your retake' : 'Capture overlapping views around you'}</span></div>
              <div className="camera-controls"><button className="shutter" onClick={manualShutter} aria-label={retakeId ? 'Retake photo' : 'Capture photo'}><span/></button><span className="shutter-hint">{retakeId ? 'RETAKE PHOTO' : 'TAP TO CAPTURE'}</span></div>
            </>}
            {cameraError && <div className="camera-error" role="alert"><span>{cameraError}</span><button onClick={() => setCameraError('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
            <div className="frame-bottom"><span>CAMERA PREVIEW</span><span>01 <i>/</i> 02</span></div>
          </div>

          <div className="capture-tools"><div className="mode-label"><span className="mode-icon"><Icon name="camera" size={16}/></span><div><strong>Manual capture</strong><small>Take each photo when you’re ready</small></div></div><button className="add-photos" onClick={() => fileRef.current?.click()}>Add photos <span>＋</span></button><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}/></div>
        </div>

        <aside className="side-column">
          <div className="memory-card">
            <div className="card-heading"><span className="card-kicker">YOUR MEMORY</span><span className="draft-tag"><span/> DRAFT</span></div>
            <label className="title-label" htmlFor="memory-title">Give this moment a name</label>
            <input id="memory-title" className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80}/>
            <div className="title-underline"/>
            <div className="progress-block"><div className="progress-heading"><span>Photo collection</span><strong>{photos.length} <small>photos</small></strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }}/></div><div className="progress-caption"><span>{photos.length < 12 ? 'Suggested: 12–20 overlapping photos' : 'Suggested range met — add more if useful'}</span><span>12–20</span></div></div>
            <div className="coverage-note"><span className="coverage-icon">✳</span><span>Small turns, lots of overlap.<br/>Keep your feet in one place.</span></div>
          </div>

          <div className="gallery-section" id="captures"><div className="gallery-heading"><div><span className="card-kicker">THE MOMENTS</span><h2>Your captures <span>{photos.length}</span></h2></div><button className="clear-button" onClick={() => photos.forEach((photo) => removePhoto(photo.id))} disabled={!photos.length}>Clear all</button></div>
            {photos.length === 0 ? <div className="empty-gallery"><div className="empty-icon"><Icon name="camera" size={21}/></div><div><strong>Nothing captured yet</strong><span>Your photos will find a home here.</span></div></div> : <div className="thumbnail-grid">{photos.map((photo, index) => <div className="photo-tile" key={photo.id}><img src={photo.url} alt={`Capture ${index + 1}`}/><span className="photo-number">{String(index + 1).padStart(2, '0')}</span><div className="tile-actions"><button onClick={() => beginRetake(photo.id)} title="Retake this photo" aria-label={`Retake photo ${index + 1}`}><Icon name="refresh" size={14}/></button><button onClick={() => removePhoto(photo.id)} title="Delete photo" aria-label={`Delete photo ${index + 1}`}><Icon name="trash" size={14}/></button></div></div>)}</div>}
          </div>

          <div className="next-step"><div className="next-step-top"><span className="card-kicker">LOCAL IMAGE PROCESSING</span><span className="next-number">02</span></div><div className="next-step-title">Stitch your<br/><em>surroundings.</em></div><div className="next-step-bottom"><span>{photos.length < 2 ? 'Add at least two overlapping photos' : `${photos.length} photos ready to process`}</span><span className="next-arrow"><Icon name="arrow" size={17}/></span></div><button className="stitch-button" onClick={stitchPhotos} disabled={stitching || photos.length < 2}>{stitching ? 'Finding overlapping features…' : 'Stitch panorama'} <Icon name="arrow" size={16}/></button><small className="phase-hint">Creates a partial panorama on this computer</small>{stitchError && <div className="stitch-error" role="alert">{stitchError}</div>}{stitchResult && <div className="stitch-result"><img src={stitchResult.url} alt="Stitched partial panorama"/><div className="stitch-result-meta"><span>PARTIAL PANORAMA · {stitchResult.imageCount} PHOTOS</span><a href={stitchResult.url} download="still-here-panorama.jpg">Download image</a></div>{stitchResult.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div>}</div>
        </aside>
      </section>
      <footer className="footer"><span>MADE FOR THE MOMENTS THAT MATTER</span><span>360° MEMORY STUDIO <i>·</i> 2026</span></footer>
    </main>
  );
}
