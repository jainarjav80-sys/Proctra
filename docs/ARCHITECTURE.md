# System Architecture Specification (`ARCHITECTURE.md`)
## Enterprise AI-Powered Video Interview Agent with Dual-Camera & Multi-Modal Anti-Cheat Forensics

**Architecture Version:** 1.1 (Production Release — Synchronized with `PDR.md` v1.1 & `TRD.md` v1.1)  
**Architectural Paradigm:** Event-Driven Hybrid Edge-Cloud Microservices + WebRTC Selective Forwarding Unit (SFU) Media Mesh + GPU Forensics Pipeline  
**Scope:** End-to-End Topology, Component Boundaries, Real-Time Media & Telemetry Data Flows, State Machines, Anti-Cheat Forensics Pipelines, Security Boundaries, and Cloud/Kubernetes Deployment

---

## 1. Architectural Drivers & Core Design Principles

To deliver a production-grade autonomous video interviewing and anti-cheat platform—rather than a brittle prototype—the architecture is governed by six non-negotiable engineering principles:

1. **Zero-Trust Server-Authoritative Forensics (Edge Speed + Cloud Truth):**
   * High-frequency computer vision (`30 FPS` 478-point 3D facial mesh, iris vector tracking, and Mouth Aspect Ratio kinematics) and browser integrity hooks (`visibilitychange`, `blur`, `window.screen.isExtended`, `displaySurface === "monitor"`) execute in a client-side WebAssembly/WebGPU Worker for `< 50ms` UI feedback.
   * Simultaneously, the server-side GPU Forensics Cluster independently consumes raw RTP media streams directly from the WebRTC SFU to execute **YOLOv8x** (multi-person, hidden phone, physical secondary monitor detection), **SyncNet** (neural audio-visual lip-sync verification), and **PyAnnote** (multi-speaker diarization). Client-side tampering cannot bypass server-side media inspection.
2. **Sub-Second Full-Duplex Conversational Loop (`< 850ms` p95):**
   * The AI Interviewer operates as a native server-side WebRTC room participant over low-latency UDP/SRTP—streaming candidate audio directly into Deepgram Nova-2 STT + Silero VAD, routing turn decisions through a deterministic Finite State Machine (FSM), and streaming Cartesia/ElevenLabs TTS audio + viseme lip-sync markers back without HTTP polling overhead.
3. **Strict Two-Tier Telemetry Separation (`Observed_Event` vs. `Inferred_Suspicion`):**
   * All sensor and browser hooks emit immutable Tier-1 `OBSERVED_EVENT` records into a Redis TimeSeries sliding window. A dedicated **Temporal Pattern Correlator** promotes patterns to Tier-2 `INFERRED_SUSPICION` incidents only when multi-signal thresholds are crossed, attaching synchronized 3-stream video evidence clips and mandatory benign explanations.
4. **Hard Modality Isolation for Bias-Free Grading:**
   * An architectural air-gap separates the **Media & Proctoring Plane** from the **Candidate Evaluation Plane**. The LLM Evaluation Engine receives *only* sanitized text transcripts, word-level timestamps, job descriptions, resumes, and scoring rubrics—never raw audio, speaking speed, accent features, video frames, or proctoring flags.
5. **Bounded Autonomy & Deterministic Guardrails:**
   * If a recruiter leaves question count blank, the blueprint service deterministically generates `10` primary questions. Adaptive follow-up questions (`Qi.a`) are governed by both a per-question cap and a real-time remaining-time budget calculator (`unallocated_buffer > 90s`).
6. **Zero-Install Cross-Device Companion Pairing:**
   * The secondary smartphone workspace camera connects via standard mobile Safari/Chrome using an ephemeral, single-use JWT QR handshake and publishes a dedicated WebRTC video track into the same SFU room with NTP/RTCP Sender Report (SR) synchronization.

---

## 2. C4 System Context & Macro Container Architecture

### 2.1 Level 1 — System Context Diagram

```
                         +-----------------------------------------+
                         |               RECRUITER                 |
                         | - Configures Job, Rubric & Anti-Cheat   |
                         | - Uploads JD & Candidate PDF/DOCX       |
                         | - Reviews 3-Stream Video & Timeline     |
                         | - Overrides Scores & Dispositions Flags |
                         +--------------------+--------------------+
                                              | HTTPS / WSS (RBAC JWT)
                                              v
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|               ENTERPRISE AI VIDEO INTERVIEW & INTELLIGENT PROCTORING PLATFORM                     |
|                                                                                                   |
|  - Autonomous Voice/Video Interview Agent       - Tab Change & Extended Display Lockdown          |
|  - Dynamic JD/Resume Question Blueprinting      - 30 FPS Iris Saccade & Gaze Oscillation Tracker  |
|  - Dual-Camera + Screen-Share WebRTC SFU        - Real-Time MAR + SyncNet Lip-Sync Verifier       |
|  - Two-Tier Observed vs. Inferred Forensics     - Bias-Insulated 1-5 Rubric Evaluation Engine     |
|                                                                                                   |
+--------------------+---------------------------------------------------------+--------------------+
                     ^                                                         ^
                     | WSS / WebRTC (DTLS-SRTP)                                | WSS / WebRTC (DTLS-SRTP)
                     | Primary Cam + Mic + Full Monitor Share                  | Secondary Rear/Wide Cam
                     | + 10Hz Edge CV & Browser Telemetry                      | + 1Hz Presence Heartbeat
+--------------------+--------------------+               +--------------------+--------------------+
|        CANDIDATE DESKTOP BROWSER        |               |      CANDIDATE SMARTPHONE BROWSER       |
| - Fullscreen Locked Interview Workspace |               | - Zero-Install Mobile Web Companion     |
| - WebGPU MediaPipe Face/Iris/Lip Worker |               | - Guided 45°-60° Workspace Framing UI   |
| - Tab/Focus & Extended Screen Guard     |               | - Screen WakeLock & Auto-Reconnect      |
+-----------------------------------------+               +-----------------------------------------+
```

---

### 2.2 Level 2 — Container & Microservice Topology

```
+===================================================================================================+
|                                  1. CLIENT PRESENTATION TIER                                      |
|                                                                                                   |
|  +-----------------------------+  +-------------------------------+  +-------------------------+  |
|  |   Recruiter Web Portal      |  | Candidate Desktop Workspace   |  | Mobile Companion PWA    |  |
|  |   (Next.js 14 / React 18)   |  | (Next.js 14 + Edge Proctor)   |  | (Mobile Safari/Chrome)  |  |
|  | - Job & Rubric Builder      |  | - Hardware/Display Lockdown   |  | - QR JWT Handshake      |  |
|  | - 3-Stream Sync Video Player|  | - WebWorker: MediaPipe 478pt  |  | - Rear Cam WebRTC Pub   |  |
|  | - Interactive Event Timeline|  |   Iris Gaze + Lip MAR + VAD   |  | - WakeLock & Angle Guide|  |
|  +--------------+--------------+  +---------------+---------------+  +------------+------------+  |
+=================|=================================|===============================|===============+
                  | HTTPS / REST                    | WSS / WebRTC (SRTP + DataChan)| WSS / WebRTC
                  v                                 v                               v
+===================================================================================================+
|                              2. EDGE INGRESS, GATEWAY & MEDIA MESH                                |
|                                                                                                   |
|  +-----------------------------+  +------------------------------------------------------------+  |
|  |   API & Signaling Gateway   |  |         LiveKit WebRTC SFU Cluster + coturn TURN           |  |
|  |   (FastAPI / Python 3.11)   |  | - Room Mesh: Primary A/V, Screen V, Secondary V, Agent A/V |  |
|  | - OAuth2/JWT + QR Nonce Auth|  | - RTCP Sender Report (SR) NTP Cross-Stream Sync            |  |
|  | - Rate Limiter & WebSockets |  | - LiveKit Egress Service (Synchronized MP4/HLS Recording)  |  |
|  +--------------+--------------+  +---------------+----------------------------+---------------+  |
+=================|=================================|============================|==================+
                  | Internal gRPC / Async Event Bus | Raw RTP Media + DataTrack  | Raw RTP Media
                  v                                 v                            v
+===================================================================================================+
|                         3. CORE AI, CONVERSATION & FORENSICS WORKER TIER                          |
|                                                                                                   |
|  +-----------------------------+  +-------------------------------+  +-------------------------+  |
|  | A. Ingestion & Blueprint    |  | B. Real-Time Interview Agent  |  | C. Multi-Modal Proctor  |  |
|  |    Service (CPU/LLM)        |  |    Orchestrator (LiveKit SDK) |  |    Forensics (GPU)      |  |
|  | - PDF/DOCX + OCR Parser     |  | - Deterministic Interview FSM |  | - YOLOv8x (Person/Phone/|  |
|  | - JD-Resume Graph Matcher   |  | - Streaming STT (Deepgram)    |  |   Physical Monitor)     |  |
|  | - Default-10 Q Generator    |  | - Bounded Follow-Up Router    |  | - SyncNet Lip-Sync      |  |
|  | - pgvector Deduplicator     |  | - Streaming TTS + Viseme Sync |  | - PyAnnote Diarization  |  |
|  +--------------+--------------+  +---------------+---------------+  | - Saccade & Tab Correl. |  |
|                 |                                 |                  +------------+------------+  |
|                 +---------------------------------+-------------------------------+               |
|                                                   | Redis Streams / Celery Task Queue             |
|                                                   v                                               |
|  +---------------------------------------------------------------------------------------------+  |
|  | D. Post-Interview Evaluation & Evidence Packaging Worker (Modality-Isolated)                |  |
|  | - Batch Whisper-v3/Nova-2 Aligner        - Sanitized Transcript Gate (Zero Audio/Video Bias)|  |
|  | - Multi-Pass 1-5 Rubric LLM Judge        - FFmpeg 3-Stream Evidence Clip Extractor          |  |
|  +------------------------------------------------+--------------------------------------------+  |
+===================================================|===============================================+
                                                    v
+===================================================================================================+
|                               4. PERSISTENCE & STORAGE LAYER                                      |
|                                                                                                   |
|  +-----------------------------+  +-------------------------------+  +-------------------------+  |
|  |  PostgreSQL 16 + pgvector   |  |   Redis 7 Cluster (AOF+RDB)   |  |   AWS S3 / MinIO KMS    |  |
|  | - Configs, Resumes, Q&A     |  | - Live FSM State & Locks      |  | - Encrypted Resumes     |  |
|  | - 1536-d Question Vectors   |  | - 60s Rolling Telemetry Window|  | - 3x Sync Video Streams |  |
|  | - 256-d Voice Embeddings    |  | - Single-Use QR Pairing Nonces|  | - Snapshot & 10s Clips  |  |
|  | - Incidents & Audit Logs    |  | - Pub/Sub Event Broker        |  | - Signed URL Delivery   |  |
|  +-----------------------------+  +-------------------------------+  +-------------------------+  |
+===================================================================================================+
```

---

## 3. End-to-End Architectural Sequence Diagrams

### 3.1 Workflow 1: Onboarding, Display Topology Lockdown, Lip-Sync Calibration & QR Smartphone Pairing

```
Candidate Desktop          Mobile Companion         API Gateway          Redis Cluster         LiveKit SFU
       │                          │                      │                     │                    │
       ├── 1. Submit 4x Consents ─┼─────────────────────►│                     │                    │
       │                          │                      ├── Save ConsentLog ─►│                    │
       │                          │                      │                     │                    │
       ├── 2. Audit Display:      │                      │                     │                    │
       │   screen.isExtended==false                      │                     │                    │
       │   getDisplayMedia('monitor')                    │                     │                    │
       │   Request Fullscreen     │                      │                     │                    │
       │                          │                      │                     │                    │
       ├── 3. Speak Calibration   │                      │                     │                    │
       │   Sentence (3s A/V) ─────┼─────────────────────►├── Extract 256-d Voice Emb                │
       │                          │                      │   & Baseline Lip MAR + Offset            │
       │                          │                      │                     │                    │
       ├── 4. POST /secondary-cam/token ────────────────►│                     │                    │
       │                          │                      ├── SETNX qr_nonce ──►│ (TTL = 300s)       │
       │◄─ 5. Return Signed QR JWT + Render SVG QR ──────┤                     │                    │
       │                          │                      │                     │                    │
       ├── 6. Candidate Scans QR ─► Opens /m/pair?t=JWT  │                     │                    │
       │                          ├── 7. POST /handshake►├── Consume Nonce ───►│                    │
       │                          │◄─ 8. LiveKit Token ──┤                     │                    │
       │                          │                      │                     │                    │
       │                          ├── 9. Publish Rear Cam Track (720p@15fps) ──────────────────────►│
       │◄─ 10. Room Event: Secondary Cam Connected ─────────────────────────────────────────────────┤
       ├── 11. Enable "Start Interview" Button           │                     │                    │
```

---

### 3.2 Workflow 2: Full-Duplex Autonomous Interview Loop & Bounded Adaptive Questioning

```
Candidate Desktop               LiveKit SFU               Agent Orchestrator (FSM)           LLM / STT / TTS
       │                             │                               │                              │
       │                             │                               ├── 1. Load Q[i] from Redis    │
       │                             │                               ├── 2. Stream Q[i] Text ──────►│ (Cartesia TTS)
       │◄── 3. Play Agent Audio + Visemes ───────────────────────────◄── Return 24kHz Opus + Visemes┤
       │                             │                               │                              │
       ├── 4. Candidate Speaks ─────►├── Forward RTP Audio ─────────►├── Stream Audio ─────────────►│ (Deepgram STT)
       │                             │                               │◄─ Partial Words + Timestamps ┤
       │                             │                               │                              │
       │   [Candidate Pauses > 2.4s] │                               │                              │
       │                             │                               ├── 5. Silero VAD + Semantic   │
       │                             │                               │   Endpoint Detected          │
       │                             │                               │                              │
       │                             │                               ├── 6. Check Follow-Up Budget: │
       │                             │                               │   followup_idx < max_allowed │
       │                             │                               │   AND time_buffer > 90s      │
       │                             │                               │                              │
       │                             │                               ├── 7. Evaluate Answer Depth ─►│ (Fast LLM Router)
       │                             │                               │◄─ Decision: ASK_FOLLOWUP ────┤
       │                             │                               │   (Generates Q[i].a)         │
       │                             │                               │                              │
       │◄── 8. Stream Follow-Up Question Q[i].a ─────────────────────┴──────────────────────────────┘
```

---

## 4. Deep-Dive Architecture of the 4 Enhanced Anti-Cheat Pipelines

### 4.1 Pipeline A: Tab Change, Window Blur & Extended Screen Share Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                CANDIDATE DESKTOP BROWSER SANDBOX                                  |
|                                                                                                   |
|  +---------------------------+  +----------------------------+  +------------------------------+  |
|  |   DOM Visibility & Focus  |  |  Display & Screen-Share    |  |   Input & Shortcut Blocker   |  |
|  | - visibilitychange        |  |  Topology Monitor          |  | - keydown: Alt+Tab, Cmd+Tab, |  |
|  | - window.onblur / onfocus |  | - window.screen.isExtended |  |   F12, Ctrl+Shift+I, PrtScn  |  |
|  | - document.hasFocus (5Hz) |  | - getScreenDetails()       |  | - clipboard: copy/cut/paste  |  |
|  | - fullscreenchange        |  | - displaySurface=='monitor'|  | - contextmenu disabled       |  |
|  +-------------+-------------+  +--------------+-------------+  +--------------+---------------+  |
|                |                               |                               |                  |
|                +-------------------------------+-------------------------------+                  |
|                                                | Instant High-Priority DataChannel Packet (<50ms) |
+------------------------------------------------|--------------------------------------------------+
                                                 v
+---------------------------------------------------------------------------------------------------+
|                         SERVER PROCTORING & EVIDENCE CORRELATOR WORKER                            |
|                                                                                                   |
|  1. Logs Tier-1 OBSERVED_EVENT (`OBS_TAB_HIDDEN`, `OBS_WINDOW_BLUR`, `OBS_EXTENDED_DISPLAY`)      |
|  2. Triggers Instant Frame Grabber on `track_screen_share` (1080p full-monitor WebRTC stream)     |
|  3. Cross-Checks `track_secondary_video` YOLOv8x detector for physical second monitor on desk     |
|  4. If Blur/Hidden > 3.0s OR Count >= 2 OR Extended Screen Active:                                |
|     -> Promotes to Tier-2 INFERRED_SUSPICION (`INF_UNAUTHORIZED_EXTERNAL_LOOKUP` / `MULTI_SCREEN`)|
|     -> Slices 10-second synchronized 3-stream MP4 evidence clip (`t - 2s` to `t + 8s`)            |
+---------------------------------------------------------------------------------------------------+
```

**Why this prevents bypasses:**
* Even if a candidate uses a floating "always-on-top" AI overlay window that does not trigger `visibilitychange` (because the browser tab is still technically visible behind the overlay), two independent mechanisms catch it:
  1. `window.onblur` / `!document.hasFocus()` fires the instant focus shifts to the overlay, and
  2. Mandatory `displaySurface === "monitor"` screen sharing records the entire OS desktop buffer rather than just the browser tab, capturing any overlay or side-by-side window on the primary monitor, while the **Secondary Smartphone Camera** angled at `45°–60°` visually captures the physical monitor and desk surface (catching hardware-level HDMI splitters or transparent overlays invisible to OS screen capture).

---

### 4.2 Pipeline B: Constant Eye Movement, Reading Saccade & 3D Gaze Architecture

```
+---------------------------------------------------------------------------------------------------+
|                           EDGE WEBGPU/WASM CV WORKER (30 FPS PIPELINE)                            |
|                                                                                                   |
|  [Primary Camera 720p@30fps]                                                                      |
|        │                                                                                          |
|        ▼                                                                                          |
|  [MediaPipe Face Landmarker] ──► Extracts 468 Face Mesh + 10 Iris Landmarks (468-477)             |
|        │                                                                                          |
|        ├──► 1. 3D Head Pose PnP Solver (Pitch, Yaw, Roll in Degrees)                              |
|        └──► 2. Iris Eye-in-Head Ratio (g_x, g_y) ──► Composite Gaze Vector (Theta_x, Theta_y)     |
+------------------------------------------------|--------------------------------------------------+
                                                 │ 10Hz Telemetry Vector Stream (30fps stats buffered)
                                                 v
+---------------------------------------------------------------------------------------------------+
|                        SLIDING-WINDOW SACCADE & GAZE TRAJECTORY CLASSIFIER                        |
|                                                                                                   |
|  Evaluates 15-Second Rolling Buffer (450 Frames):                                                 |
|                                                                                                   |
|  ├──► PATH 1: Natural Cognitive Recall Filter (Benign)                                            |
|  │    - Condition: Gaze shifts off-center (< 4.0s duration), low angular velocity, zero sawtooth  |
|  │    - Output: Ignored (0% False-Alarm Guarantee on normal thinking pauses)                      |
|  │                                                                                                |
|  ├──► PATH 2: High-Frequency Constant Eye Darting Detector                                        |
|  │    - Condition: >= 10 rapid saccadic jumps (> 120 deg/s) & gaze dispersion > 14.0° in 15s      |
|  │    - Output: `OBS_HIGH_FREQ_EYE_DARTING` -> Escalates to `INF_OFFSCREEN_SCRIPT_READING`        |
|  │                                                                                                |
|  └──► PATH 3: Horizontal Reading Sawtooth Wave Detector (AI Copilot / Teleprompter Check)         |
|       - Condition: >= 3 consecutive slow Left->Right sweeps (5 to 35 deg/s over 0.8-2.5s)         |
|         followed by sharp Right->Left carriage-return snapbacks (< -90 deg/s in < 150ms)          |
|       - Output: `OBS_HORIZONTAL_READING_SACCADE` -> Escalates to `HIGH` `INFERRED_SUSPICION`      |
+---------------------------------------------------------------------------------------------------+
```

---

### 4.3 Pipeline C: Real-Time Lip-Sync & Audio-Visual Voice Correlation Architecture

```
+---------------------------------------------------------------------------------------------------+
|                         DUAL-STAGE AUDIO-VISUAL LIP-SYNC FORENSICS ENGINE                         |
|                                                                                                   |
|   STAGE 1: EDGE KINEMATIC TRACKER (30 Hz)          STAGE 2: SERVER NEURAL SYNCNET + BIOMETRICS    |
|  +---------------------------------------+        +--------------------------------------------+  |
|  | - Inner Lip Landmarks (13,14,78,308,  |        | - Aligns RTP Video & Audio via RTCP NTP SR |  |
|  |   82,87,312,317) -> Computes MAR(t)   |        | - Crops 96x96 Mouth ROI (5-frame windows)  |  |
|  | - Local Mic PCM -> Silero VAD P(t)    |        | - Extracts 0.2s Mel-Spectrograms (16kHz)   |  |
|  | - Computes 2.0s Rolling Stats:        |        | - SyncNet Cosine Similarity S_AV in [0, 1] |  |
|  |   MAR_std, MAR_range, Speech_Ratio    |        |   & Temporal Phase Offset Delta_t_AV (ms)  |  |
|  +-------------------+-------------------+        | - ECAPA-TDNN 256-d Speaker Embedding Match |  |
|                      |                            +----------------------+---------------------+  |
|                      +-------------------------+-------------------------+                        |
|                                                |                                                  |
|                                                v                                                  |
|                    +-------------------------------------------------------+                      |
|                    |        3-MODE LIP-SYNC ANOMALY DECISION MATRIX        |                      |
|                    +-------------------------------------------------------+                      |
|                      │                         │                         │                        |
|                      ▼                         ▼                         ▼                        |
|       +--------------------------+ +-----------------------+ +---------------------------+        |
|       | MODE 1: Voice Active +   | | MODE 2: Speech + Lips | | MODE 3: Active Lip Motion |        |
|       | Static/Closed Lips       | | Present, Phase Desync | | + Zero Microphone Speech  |        |
|       | - VAD > 0.80 (> 1.8s)    | | - SyncNet S_AV < 0.32 | | - VAD < 0.10 (> 2.5s)     |        |
|       | - MAR_std < 0.012        | | - |Offset| > 300ms OR | | - MAR_range > 0.16 (2-5Hz)|        |
|       | -> Flags Off-Screen      | |   Voice Dist > 0.45   | | -> Flags Silent Mouthing  |        |
|       |    Speaker / Virtual Mic | | -> Flags Fake Miming  | |    to Off-Screen Helper   |        |
|       +--------------------------+ +-----------------------+ +---------------------------+        |
+---------------------------------------------------------------------------------------------------+
```

---

## 5. Multi-Track Recording, Synchronization & Evidence Slicing Architecture

A critical requirement for the Recruiter Dashboard (`Module G`) is allowing recruiters to inspect synchronized video feeds and jump directly to flagged proctoring segments.

### 5.1 RTCP NTP Clock Synchronization
1. Every media publisher (`Candidate Desktop Primary Cam`, `Candidate Desktop Screen Share`, `Candidate Smartphone Secondary Cam`, and `AI Interviewer TTS`) sends RTCP Sender Reports (SR) mapping local RTP media timestamps to absolute wall-clock NTP time.
2. The **LiveKit Egress Service** records each track with aligned PTS (Presentation Timestamps) relative to `session.started_at_ms = 0`, producing:
   * `s3://bucket/sessions/{id}/primary_cam.mp4` (`720p @ 30fps` + mixed stereo audio)
   * `s3://bucket/sessions/{id}/secondary_cam.mp4` (`720p @ 15fps`)
   * `s3://bucket/sessions/{id}/screen_share.mp4` (`1080p @ 10fps`)

### 5.2 Automated Forensic Evidence Clip Extractor
Whenever a Tier-2 `INFERRED_SUSPICION` or high-severity `OBSERVED_EVENT` (such as a `TAB_SWITCH` or `LIP_SYNC_MISMATCH`) is logged at timestamp $T_{\text{event}}$:
1. An asynchronous task is pushed to `evaluation-worker` (`clip_extractor.py`).
2. Using `FFmpeg` stream copy/compositing, the worker extracts a `10-second` window ($[T_{\text{event}} - 2\text{s}, T_{\text{event}} + 8\text{s}]$) and generates a composite **3-in-1 Forensic Evidence Clip** (Side-by-side Primary Camera + Secondary Camera + Screen Share with burned-in telemetry HUD showing Gaze Vector, Lip MAR waveform, and Active Tab Status).
3. This allows recruiters to review any incident in `< 5 seconds` with a single click without waiting for full interview files to buffer.

---

## 6. Modality-Isolated Evaluation Architecture (Anti-Bias Enforcement)

```
+---------------------------------------------------------------------------------------------------+
|                              RAW SESSION DATA AT INTERVIEW COMPLETION                             |
|                                                                                                   |
|  - Primary/Secondary/Screen Videos    - Acoustic Pitch, WPM, Accent    - Proctoring Incident Logs |
|  - Facial Landmarks & Expressions     - Streaming + Batch Transcripts  - JD, Resume & Rubrics     |
+-------------------------------------------------|-------------------------------------------------+
                                                  │
                                                  ▼
+===================================================================================================+
|                     DETERMINISTIC BIAS SANITIZATION & MODALITY ISOLATION GATE                     |
|                                                                                                   |
|  [DROPPED / BLOCKED]: Video frames, facial expressions, audio waveforms, speaking speed (WPM),    |
|                       voice pitch/timbre, accent tags, and proctoring suspicion flags.            |
|                                                                                                   |
|  [PASSED THROUGH]:    Sanitized UTF-8 Q&A Transcripts, Word Timestamps, Job Description,          |
|                       Parsed Resume Entities, and Question-Specific 1-5 Scoring Rubrics.          |
+=================================================|=================================================+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                          MULTI-PASS LLM EVALUATION & RUBRIC SCORING ENGINE                        |
|                                                                                                   |
|  - Pass 1: Question-wise 1-5 Scoring across 4 Dimensions (Correctness, Relevance, Completeness,   |
|            Demonstrated Understanding) + Mandatory Verbatim Quote Extraction ([mm:ss] anchored)   |
|  - Pass 2: Cross-Question Competency Synthesis (Technical, Problem-Solving, Communication, Fit)   |
|  - Pass 3: Strengths, Knowledge Gaps & Recommended Human Follow-Up Probing Generator              |
+---------------------------------------------------------------------------------------------------+
```

---

## 7. Cloud Infrastructure, Scalability & Fault-Tolerance Architecture

### 7.1 Kubernetes (`EKS` / `GKE`) Workload Isolation
To ensure heavy computer-vision and LLM tasks never starve real-time audio/video packets, workloads are isolated into four Kubernetes Node Groups:

| Node Pool | Instance Profile | Hosted Services | Autoscaling Metric |
| :--- | :--- | :--- | :--- |
| **1. Real-Time Media Mesh (`rtc-pool`)** | Compute-Optimized (`c6i.2xlarge`), HostNetwork UDP `50000–60000` | `LiveKit SFU`, `coturn TURN/TLS` | Active WebRTC tracks & NIC bandwidth (`target < 65%`) |
| **2. Conversational Agent Pool (`agent-pool`)** | CPU/Memory-Optimized (`m6i.xlarge`) | `agent-orchestrator`, `api-gateway` | Active concurrent interview rooms (`1 pod per 15 rooms`) |
| **3. GPU Forensics Pool (`gpu-proctor-pool`)** | GPU Accelerated (`g5.xlarge` — NVIDIA A10G) | `proctor-forensics-worker` (YOLOv8x + SyncNet + PyAnnote ONNX/TensorRT) | RTP frame queue depth (`target latency < 250ms`) |
| **4. Async Batch Pool (`batch-eval-pool`)** | Spot/Standard (`m6i.large`) | `evaluation-worker` (Rubric Judge, FFmpeg Egress Clip Builder, PDF/DOCX Parser) | Celery/Redis stream queue length |

### 7.2 High-Availability & Failure Recovery Mechanisms
* **WebRTC ICE Restart & TURN Fallback:** If a candidate's corporate firewall blocks UDP, `coturn` automatically tunnels media over `TURN/TLS` on port `443`. If temporary Wi-Fi packet loss occurs, LiveKit triggers an automatic ICE Restart while the `agent-orchestrator` pauses the question countdown timer in Redis.
* **Idempotent State Recovery:** Every question transition and transcript segment is committed atomically to Redis and PostgreSQL. If a browser crashes or refreshes mid-interview, re-opening the session link restores the exact active question, elapsed timer, and secondary camera binding within `< 2.0 seconds`.
* **Graceful Degradation of Edge CV:** If a candidate's laptop lacks WebGPU acceleration, the `edge-proctor-sdk` automatically steps down local inference from `30 FPS` to `15 FPS` WASM SIMD while increasing server-side `proctor-forensics-worker` sampling rate so zero proctoring coverage is lost.
