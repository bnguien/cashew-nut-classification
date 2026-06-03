import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { 
  Activity, 
  Cpu, 
  Wifi, 
  Play, 
  Square, 
  Upload, 
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  Zap,
  Check
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE || "";

function headers() {
  const h = { "Content-Type": "application/json" };
  const key = import.meta.env.VITE_WEBTEST_KEY;
  if (key) h["X-WebTest-Key"] = key;
  return h;
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [requests, setRequests] = useState([]);
  const [log, setLog] = useState([]);
  const [heartbeatOn, setHeartbeatOn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [latestResult, setLatestResult] = useState(null);
  
  const logEndRef = useRef(null);

  const pushLog = useCallback((msg) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const apiPost = useCallback(async (path, body) => {
    const res = await fetch(`${API}/api/webtest${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || JSON.stringify(data));
    }
    return data;
  }, []);

  useEffect(() => {
    fetch(`${API}/api/webtest/status/`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ webtest_enabled: false }));
  }, []);

  useEffect(() => {
    const base = API || window.location.origin;
    const wsBase = base.startsWith("https://") ? base.replace("https://", "wss://") : base.replace("http://", "ws://");
    const ws = new WebSocket(`${wsBase}/ws/conveyor/`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "esp_control_request") {
          setRequests((prev) => [msg.data, ...prev].slice(0, 20));
          pushLog(`Mobile -> ESP req: ${msg.data.action} (session #${msg.data.session_id})`);
          return;
        }
        if (msg.type === "esp_control_decision") {
          pushLog(`Web decision: ${msg.data.action} => ${msg.data.accepted ? "ACCEPT" : "REJECT"}`);
          return;
        }
        if (msg.type === "esp_port_tx") {
          pushLog(`TX: ${msg.data.topic} ${JSON.stringify(msg.data.payload)}`);
          return;
        }
        if (msg.type === "esp_port_rx") {
          pushLog(`RX: ${msg.data.topic} ${JSON.stringify(msg.data.payload)}`);
          return;
        }
        if (msg.type === "classify_result") {
          setLatestResult(msg.data);
          pushLog(`AI classify_result: ${msg.data?.grade} (${msg.data?.confidence})`);
          return;
        }
        if (msg.type === "mobile_control_signal" || msg.type === "mobile_control_trigger") {
          pushLog(`MQTT Signal: ${msg.data?.command} session=${msg.data?.session_id}`);
          return;
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => pushLog("WS error");
    ws.onopen = () => pushLog("WS connected /ws/conveyor/");
    ws.onclose = () => pushLog("WS closed");

    return () => ws.close();
  }, [pushLog]);

  useEffect(() => {
    if (!heartbeatOn) return;
    pushLog("Heartbeat auto started (5s)");
    const tick = async () => {
      try {
        await apiPost("/mqtt/presets/", { action: "heartbeat" });
      } catch (e) {
        setErr(String(e.message));
      }
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [heartbeatOn, apiPost, pushLog]);

  async function onDecision(requestId, accept) {
    try {
      await apiPost("/esp/decision/", { request_id: requestId, accept });
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch (e) {
      setErr(String(e.message));
    }
  }

  async function sendServo(grade) {
    try {
      await apiPost("/servo/press/", { grade });
      pushLog(`Simulated Servo Push: ${grade}`);
    } catch (e) {
      setErr(String(e.message));
    }
  }

  async function triggerMobileCommand(command) {
    try {
      const action = command === "start" ? "mobile_start" : "mobile_stop";
      await apiPost("/mqtt/presets/", { action, session_id: null });
      pushLog(`Simulated Mobile Command: ${action.toUpperCase()}`);
    } catch (e) {
      setErr(String(e.message));
    }
  }

  async function uploadImage() {
    if (!selectedFile) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("image", selectedFile);
      const reqHeaders = {};
      const key = import.meta.env.VITE_WEBTEST_KEY;
      if (key) reqHeaders["X-WebTest-Key"] = key;

      const res = await fetch(`${API}/api/webtest/ai/upload/`, {
        method: "POST",
        headers: reqHeaders,
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.detail || JSON.stringify(data));

      setLatestResult(data.result);
      pushLog(`AI upload success: ${data.result?.grade} (${data.result?.confidence})`);
    } catch (e) {
      setErr(String(e.message));
      pushLog(`AI upload error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  if (status && !status.webtest_enabled) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#f8fafc' }}>
        <AlertTriangle size={48} style={{ color: '#f43f5e', margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Web Test is Disabled</h1>
        <p style={{ color: '#94a3b8' }}>Set <code>WEBTEST_ENABLED=true</code> in Django <code>.env</code> and restart server.</p>
      </div>
    );
  }

  // Helpers to get grade styling
  const getGradeColor = (g) => {
    if (g === 'whole') return 'var(--accent-emerald)';
    if (g === 'broken') return 'var(--accent-amber)';
    if (g === 'defect') return 'var(--accent-rose)';
    return 'var(--text-muted)';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100vh', overflow: 'hidden' }}>
      
      {/* SIDEBAR */}
      <div className="glass-panel" style={{ margin: '16px 0 16px 16px', display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ padding: 24, borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ background: 'var(--accent-cyan)', padding: 8, borderRadius: 10 }}>
              <Cpu size={24} color="#0f172a" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>Cashew Control</h1>
              <div style={{ fontSize: 12, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }}></span>
                System Online
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {err && (
            <div className="animate-slide-up" style={{ padding: 12, background: 'rgba(244, 63, 94, 0.1)', borderLeft: '3px solid var(--accent-rose)', borderRadius: 8, fontSize: 13, color: '#fecdd3' }}>
              {err}
            </div>
          )}

          <div>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wifi size={14} /> Mobile Triggers
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="success" style={{ flex: 1 }} onClick={() => triggerMobileCommand("start")}>
                <Play size={16} /> Start
              </button>
              <button className="danger" style={{ flex: 1 }} onClick={() => triggerMobileCommand("stop")}>
                <Square size={16} /> Stop
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Server size={14} /> Servo Simulation
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => sendServo("whole")}>Whole</button>
              <button onClick={() => sendServo("broken")}>Broken</button>
              <button onClick={() => sendServo("defect")} style={{ gridColumn: 'span 2' }}>Defect</button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} /> Pending Requests
            </h3>
            {requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', border: '1px dashed var(--border-light)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                All clear
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {requests.map(r => (
                  <div key={r.request_id} className="animate-fade-in" style={{ background: 'var(--bg-main)', padding: 12, borderRadius: 10, border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{String(r.action).toUpperCase()} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>#{r.session_id}</span></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="success" style={{ flex: 1, height: 32 }} onClick={() => onDecision(r.request_id, true)}><Check size={14} /> Accept</button>
                      <button className="danger" style={{ flex: 1, height: 32 }} onClick={() => onDecision(r.request_id, false)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ marginTop: 'auto' }}>
            <button 
              onClick={() => setHeartbeatOn(!heartbeatOn)} 
              style={{ width: '100%', borderColor: heartbeatOn ? 'var(--accent-cyan)' : 'var(--border-light)', color: heartbeatOn ? 'var(--accent-cyan)' : 'var(--text-main)' }}
            >
              <Zap size={16} /> {heartbeatOn ? "Stop Heartbeat" : "Auto Heartbeat (5s)"}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 24px', overflowY: 'auto' }}>
        
        {/* TOP BAR: Upload & Status */}
        <div className="glass-panel animate-slide-up" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderRadius: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-main)', border: '1px dashed var(--accent-cyan)', padding: '10px 16px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s', color: 'var(--accent-cyan)' }}>
              <Upload size={18} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{selectedFile ? selectedFile.name : "Select Image"}</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                const f = e.target.files?.[0];
                setSelectedFile(f);
                if (f) setPreviewUrl(URL.createObjectURL(f));
              }}/>
            </label>
            <button className="primary" onClick={uploadImage} disabled={uploading || !selectedFile} style={{ height: 42, borderRadius: 12, padding: '0 24px' }}>
              {uploading ? "Analyzing..." : "Process Inference"}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {latestResult && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Model Version</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{latestResult.model_version || 'Unknown'}</div>
                </div>
                <div style={{ width: 1, height: 32, background: 'var(--border-light)' }}></div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inference Time</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-cyan)' }}>{latestResult.inference_ms ? `${latestResult.inference_ms}ms` : '--'}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3-FRAME VISION INSPECTOR */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ImageIcon size={20} color="var(--accent-cyan)"/> Vision Inspector
            {latestResult && (
              <span style={{ marginLeft: 'auto', background: 'var(--bg-panel)', padding: '4px 12px', borderRadius: 20, fontSize: 14, border: `1px solid ${getGradeColor(latestResult.grade)}`, color: getGradeColor(latestResult.grade) }}>
                {latestResult.grade.toUpperCase()} ({(latestResult.confidence * 100).toFixed(1)}%)
              </span>
            )}
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {/* FRAME 1: RAW */}
            <div className={`glass-panel animate-slide-up ${latestResult ? 'vision-frame-active' : ''}`} style={{ animationDelay: '0ms', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-light)', fontSize: 13, fontWeight: 600, letterSpacing: 0.5, color: '#94a3b8' }}>
                1. CAMERA RAW
              </div>
              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, position: 'relative' }}>
                {(latestResult?.raw_image_url || previewUrl) ? (
                  <img src={latestResult?.raw_image_url || previewUrl} alt="Raw" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <ImageIcon size={32} opacity={0.5} />
                    <span>Waiting for capture</span>
                  </div>
                )}
              </div>
            </div>

            {/* FRAME 2: CROPPED */}
            <div className={`glass-panel animate-slide-up ${latestResult ? 'vision-frame-active' : ''}`} style={{ animationDelay: '100ms', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-light)', fontSize: 13, fontWeight: 600, letterSpacing: 0.5, color: '#94a3b8' }}>
                2. AUTO CROP & PREPROCESS
              </div>
              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, position: 'relative' }}>
                {latestResult?.image_url ? (
                  <img src={latestResult.image_url} alt="Cropped" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <ImageIcon size={32} opacity={0.5} />
                    <span>Pending</span>
                  </div>
                )}
              </div>
            </div>

            {/* FRAME 3: LABELED */}
            <div className={`glass-panel animate-slide-up ${latestResult ? 'vision-frame-active' : ''}`} style={{ animationDelay: '200ms', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-light)', fontSize: 13, fontWeight: 600, letterSpacing: 0.5, color: 'var(--accent-cyan)' }}>
                3. AI INFERENCE
              </div>
              <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, position: 'relative' }}>
                {latestResult?.labeled_image_url ? (
                  <img src={latestResult.labeled_image_url} alt="Labeled" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <ImageIcon size={32} opacity={0.5} />
                    <span>Pending</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* TERMINAL LOG */}
        <div className="glass-panel animate-slide-up" style={{ flex: 1, display: 'flex', flexDirection: 'column', animationDelay: '300ms', minHeight: 200 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f43f5e' }}></div>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }}></div>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }}></div>
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>system_terminal_tty1</span>
          </div>
          <div style={{ padding: 16, overflowY: 'auto', flex: 1, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, lineHeight: 1.6, color: '#cbd5e1' }}>
            {log.length === 0 ? <div style={{ color: '#475569' }}>Awaiting events...</div> : (
              log.map((line, i) => (
                <div key={i} style={{ opacity: 1 - (i * 0.05) }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>➜</span> {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}
