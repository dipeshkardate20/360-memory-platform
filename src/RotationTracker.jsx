import { useEffect, useRef, useState } from 'react';
import './rotation-tracker.css';
import { clampRotation, directionalProgressDelta, wrappedAngleDelta } from './rotation-math.js';

const MILESTONES = Array.from({ length: 12 }, (_, index) => (index + 1) * 30);

export default function RotationTracker() {
  const [direction, setDirection] = useState('right');
  const [status, setStatus] = useState('idle');
  const [angle, setAngle] = useState(0);
  const [reached, setReached] = useState([]);
  const [message, setMessage] = useState('Choose a direction, then start at your starting view.');
  const lastAlpha = useRef(null);
  const angleRef = useRef(0);
  const milestonesRef = useRef(new Set());
  const sensorTimeout = useRef(null);
  const receivedSensorReading = useRef(false);

  const resetTracker = (nextStatus) => {
    clearTimeout(sensorTimeout.current);
    lastAlpha.current = null;
    angleRef.current = 0;
    milestonesRef.current = new Set();
    receivedSensorReading.current = false;
    setAngle(0);
    setReached([]);
    setStatus(nextStatus);
  };

  const updateAngle = (nextAngle) => {
    const previousAngle = angleRef.current;
    const safeAngle = clampRotation(nextAngle);
    angleRef.current = safeAngle;
    setAngle(safeAngle);

    for (const milestone of MILESTONES) {
      if (safeAngle >= milestone - 0.5) milestonesRef.current.add(milestone);
      else if (safeAngle < milestone - 2) milestonesRef.current.delete(milestone);
    }
    setReached([...milestonesRef.current]);

    if (safeAngle >= 360) {
      setStatus('complete');
      setMessage('Full rotation complete. You can start again or review the milestones.');
    } else {
      const nextTarget = Math.min(360, (Math.floor(safeAngle / 30) + 1) * 30);
      setMessage(safeAngle === 0
        ? `Rotate slowly to the ${direction}.`
        : safeAngle < previousAngle
          ? `You turned back. Rotate ${direction} toward ${nextTarget}°.`
        : safeAngle >= nextTarget - 4
          ? `Almost there — hold near ${nextTarget}°.`
          : `Keep rotating ${direction} toward ${nextTarget}°.`);
    }
  };

  useEffect(() => {
    if (status !== 'tracking') return undefined;

    const onOrientation = (event) => {
      if (event.alpha == null || !Number.isFinite(event.alpha)) return;
      clearTimeout(sensorTimeout.current);
      receivedSensorReading.current = true;

      if (lastAlpha.current == null) {
        lastAlpha.current = event.alpha;
        setMessage(`Starting direction set to 0°. Rotate ${direction}.`);
        return;
      }

      let delta = wrappedAngleDelta(event.alpha, lastAlpha.current);
      lastAlpha.current = event.alpha;
      if (Math.abs(delta) < 0.8) return;
      // Ignore impossible one-frame jumps, while allowing brisk phone turns.
      if (Math.abs(delta) > 45) return;

      // DeviceOrientation alpha increases for a counter-clockwise turn, so a
      // user's right turn advances in the opposite alpha direction.
      const chosenDirectionDelta = directionalProgressDelta(delta, direction);
      updateAngle(angleRef.current + chosenDirectionDelta);
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      clearTimeout(sensorTimeout.current);
    };
  }, [status, direction]);

  useEffect(() => () => clearTimeout(sensorTimeout.current), []);

  const startTracking = async () => {
    if (status === 'requesting') return;
    resetTracker('requesting');
    setMessage('Requesting motion sensor access…');

    if (!('DeviceOrientationEvent' in window)) {
      resetTracker('manual');
      setMessage('Motion sensors are unavailable here. Use the manual controls to try the tracker.');
      return;
    }

    try {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await window.DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('permission');
      }
      resetTracker('tracking');
      setMessage('Hold your phone at the starting view while the sensor sets 0°.');
      sensorTimeout.current = window.setTimeout(() => {
        if (!receivedSensorReading.current) {
          setStatus('manual');
          setMessage('No motion readings arrived. Use the manual controls to try the tracker.');
        }
      }, 3000);
    } catch (error) {
      resetTracker('manual');
      setMessage(error.message === 'permission'
        ? 'Motion permission was declined. Use the manual controls, or allow motion access in Safari settings.'
        : 'Motion sensors could not start. Use the manual controls to try the tracker.');
    }
  };

  const adjustManually = (amount) => {
    if (status !== 'manual') return;
    updateAngle(angleRef.current + amount);
  };

  const percent = Math.round((angle / 360) * 100);
  const nextTarget = angle >= 360 ? 360 : Math.min(360, (Math.floor(angle / 30) + 1) * 30);
  const circumference = 2 * Math.PI * 62;

  return (
    <section className="rotation-card" aria-labelledby="rotation-title">
      <div className="rotation-heading">
        <div>
          <span className="card-kicker">360° ROTATION TRACKER</span>
          <h2 id="rotation-title">Turn through the scene</h2>
        </div>
        <span className={`rotation-status ${status}`}><i />{status === 'tracking' ? 'TRACKING' : status === 'complete' ? 'COMPLETE' : status === 'manual' ? 'MANUAL TEST' : status === 'requesting' ? 'REQUESTING' : 'READY'}</span>
      </div>

      <div className="rotation-content">
        <div className="rotation-dial" role="img" aria-label={`${Math.round(angle)} degrees of 360 degrees, ${percent} percent covered`}>
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle className="dial-track" cx="80" cy="80" r="62" />
            <circle className="dial-progress" cx="80" cy="80" r="62" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - angle / 360)} />
            {MILESTONES.map((milestone) => {
              const radians = (milestone / 360) * Math.PI * 2 - Math.PI / 2;
              const x = 80 + Math.cos(radians) * 62;
              const y = 80 + Math.sin(radians) * 62;
              return <circle key={milestone} className={`dial-milestone ${reached.includes(milestone) ? 'reached' : ''} ${nextTarget === milestone ? 'next' : ''}`} cx={x} cy={y} r="3.5" />;
            })}
          </svg>
          <div className="dial-center"><strong>{Math.round(angle)}<small>°</small></strong><span>OF 360°</span><b>{percent}%</b></div>
        </div>

        <div className="rotation-details">
          <div className="rotation-direction" role="group" aria-label="Choose rotation direction">
            <span>ROTATE</span>
            <button className={direction === 'left' ? 'direction-choice active' : 'direction-choice'} onClick={() => setDirection('left')} disabled={status === 'tracking'} aria-pressed={direction === 'left'}>← Left</button>
            <button className={direction === 'right' ? 'direction-choice active' : 'direction-choice'} onClick={() => setDirection('right')} disabled={status === 'tracking'} aria-pressed={direction === 'right'}>Right →</button>
          </div>
          <p className="rotation-instruction" aria-live="polite">{message}</p>
          <div className="rotation-target"><span>NEXT TARGET</span><strong>{nextTarget}°</strong><small>{reached.length} of 12 milestones reached</small></div>
          {status === 'manual' && <div className="manual-stepper"><button onClick={() => adjustManually(-30)} aria-label="Move tracker back 30 degrees">− 30°</button><button onClick={() => adjustManually(30)} aria-label="Advance tracker 30 degrees">+ 30°</button></div>}
          <div className="rotation-actions">
            {status === 'idle' || status === 'complete' ? <button className="rotation-start" onClick={startTracking}>{status === 'complete' ? 'Start again' : 'Start 360° tracking'}<span>↗</span></button> : status === 'requesting' ? <button className="rotation-stop" disabled>Waiting for permission…</button> : status === 'manual' ? <button className="rotation-start secondary" onClick={startTracking}>Try phone sensors<span>↗</span></button> : <button className="rotation-stop" onClick={() => { resetTracker('idle'); setMessage('Tracker stopped. Start again when you are ready.'); }}>Stop tracking</button>}
            {status === 'tracking' && <button className="rotation-manual-link" onClick={() => { resetTracker('manual'); setMessage('Manual test mode. Use ±30° to move through the milestones.'); }}>Use manual test</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
