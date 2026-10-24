# Architecture & Product Decision Log (`DECISION_LOG.md`)
## Enterprise AI-Powered Video Interview Agent with Dual-Camera & Multi-Modal Anti-Cheat Forensics

**Document Version:** 1.1 (Production Release — Synchronized with `PDR.md` v1.1, `TRD.md` v1.1 & `ARCHITECTURE.md` v1.1)  
**Format:** MADR (Markdown Architectural Decision Records)  
**Scope:** Auditable Engineering, Security, AI/ML, and Product Trade-Off Decisions Governing the Full-Lifecycle Autonomous Interview & Proctoring Platform

---

## 1. Decision Index & Summary Matrix

| ADR ID | Decision Title | Category | Status | Target Subsystem |
| :--- | :--- | :--- | :--- | :--- |
| **`ADR-001`** | Adopt WebRTC SFU (`LiveKit`) Over Peer-to-Peer Mesh or HTTP Chunked Recording | Real-Time Media | **Accepted** | Media Mesh & Egress |
| **`ADR-002`** | Hybrid Edge-Cloud Computer Vision Split (`MediaPipe WebWorker` + `Server GPU YOLOv8x`) | Proctoring & Anti-Tampering | **Accepted** | Edge SDK & Forensics Worker |
| **`ADR-003`** | Two-Tier Telemetry Model (`Observed_Event` vs. `Inferred_Suspicion`) with Human-in-the-Loop Governance | Ethics & Proctoring | **Accepted** | Proctoring Correlator & DB |
| **`ADR-004`** | Multi-Layer Display Lockdown (`isExtended` + `displaySurface === "monitor"` + Secondary Cam Monitor Check) | Enhanced Anti-Cheat | **Accepted** | Browser Guard & Onboarding |
| **`ADR-005`** | 3D Iris Trajectory & Reading Sawtooth Wave Classifier Over Naive Gaze Bounding Boxes | Enhanced Anti-Cheat | **Accepted** | Gaze & Saccade Analyzer |
| **`ADR-006`** | Dual-Stage Lip-Sync Verification (`Edge MAR Kinematics` + `Server SyncNet` + `ECAPA-TDNN` Voice Biometrics) | Enhanced Anti-Cheat | **Accepted** | Audio-Visual Sync Verifier |
| **`ADR-007`** | Zero-Install Mobile Web PWA with Ephemeral Single-Use JWT QR Handshake for Secondary Camera | Companion Camera | **Accepted** | Mobile Companion & Auth |
| **`ADR-008`** | Deterministic Finite State Machine (FSM) with Default-10 Fallback & Time-Budgeted Follow-Up Guardrails | Conversational AI | **Accepted** | Agent Orchestrator |
| **`ADR-009`** | Split-Model LLM Strategy (`gpt-4o-mini`/`Haiku` for Real-Time Turn Routing; `gpt-4o`/`Sonnet` for Blueprint & Grading) | AI Latency & Cost | **Accepted** | LLM Orchestration |
| **`ADR-010`** | Strict Modality Air-Gap & Transcript Sanitization for Bias-Free Candidate Evaluation | Fairness & Compliance | **Accepted** | Evaluation Worker |
| **`ADR-011`** | Unified `PostgreSQL 16 + pgvector` + `Redis 7 TimeSeries` Over Polyglot NoSQL Sprawl | Data Persistence | **Accepted** | Database Layer |
| **`ADR-012`** | Automated `FFmpeg` 3-in-1 Composite Evidence Clip Slicing with Burned-In Telemetry HUD | Recruiter UX & Storage | **Accepted** | Evidence Packaging Worker |

---

## 2. Detailed Architectural Decision Records (ADRs)

---

### `ADR-001`: Adopt WebRTC SFU (`LiveKit`) Over Peer-to-Peer WebRTC or HTTP Chunked Upload
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Each interview session requires streaming and recording four concurrent real-time tracks (`Primary Frontal Video + Audio`, `Full-Monitor Screen Share`, `Secondary Smartphone Camera Video`, and `AI Interviewer Audio/Visemes`) while simultaneously feeding raw media to the server-side conversational agent and GPU proctoring workers.
* **Options Considered:**
  1. **Client-Side `MediaRecorder` Chunked HTTP Uploads (`WebM` blobs every 5s to S3):** Simple to build, but introduces `5–10s` proctoring latency, fails if the browser tab crashes before flushing, and cannot support sub-second full-duplex voice interaction or cross-camera NTP synchronization.
  2. **Peer-to-Peer (P2P) WebRTC:** Works for 1:1 human calls, but requires the client to upload duplicate streams to multiple consumers and lacks a server-side media termination point for AI STT/TTS and server-authoritative CV.
  3. **WebRTC Selective Forwarding Unit (`LiveKit SFU` + `coturn` TURN/TLS):** Clients publish each track once over encrypted `DTLS-SRTP` to the SFU; server workers (`agent-orchestrator` and `proctor-forensics-worker`) join the room as native internal participants.
* **Decision:** Choose **Option 3 (`LiveKit SFU`)**.
* **Consequences:**
  * **Positive:** Enables `< 850ms` voice-to-voice turn-taking, RTCP Sender Report (SR) NTP clock alignment across desktop and smartphone cameras, resilient TURN/TLS port `443` traversal through strict firewalls, and lossless server-side Egress recording even if a candidate closes their browser mid-sentence.
  * **Negative / Mitigation:** Requires dedicated UDP port ranges (`50000–60000`) on Kubernetes `rtc-pool` nodes, mitigated via standardized Helm hostPort configurations.

---

### `ADR-002`: Hybrid Edge-Cloud Computer Vision Split (`MediaPipe WebWorker` + `Server GPU YOLOv8x`)
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Running 30 FPS 478-point facial landmarking, iris tracking, and lip Mouth Aspect Ratio (`MAR`) calculation for hundreds of concurrent interviews purely on cloud GPUs would incur massive bandwidth and GPU compute costs. Conversely, running proctoring *exclusively* in client-side JavaScript is vulnerable to DevTools tampering or monkey-patching.
* **Options Considered:**
  1. **100% Client-Side Edge CV:** Zero server GPU cost, but trivially bypassed by overriding WebSocket telemetry packets in the browser console.
  2. **100% Server-Side Cloud GPU CV at 30 FPS:** Tamper-proof, but requires `~1.5 GPU cores` per candidate across 3 video streams, making unit economics prohibitive at scale.
  3. **Hybrid Edge-Cloud Split with Server-Authoritative Auditing:** Run `30 FPS` MediaPipe Face/Iris/Lip tracking inside an isolated client WebWorker (`WASM/WebGPU`) streaming `10Hz` kinematic vectors, while the server GPU worker samples raw SFU RTP frames (`2–5 FPS` + event-triggered bursts) to run `YOLOv8x` (person/phone/monitor detection), `SyncNet` (lip-sync verification), and telemetry consistency audits.
* **Decision:** Choose **Option 3 (Hybrid Edge-Cloud Split)**.
* **Consequences:**
  * **Positive:** Reduces server GPU footprint by `80%` while maintaining `< 50ms` real-time framing/gaze feedback and `100%` server-authoritative protection against client telemetry spoofing (`INF_CLIENT_TELEMETRY_TAMPERING`).
  * **Negative / Mitigation:** Older candidate laptops without WebGPU fall back to `15 FPS` WASM SIMD automatically while the server increases its sampling rate for that session.

---

### `ADR-003`: Two-Tier Telemetry Model (`Observed_Event` vs. `Inferred_Suspicion`) with Human-in-the-Loop Governance
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Section `3.D` of the Problem Statement explicitly mandates: *"The system should distinguish between an observed event and an inferred suspicion. For example, looking away from the screen may have many explanations and should not automatically be classified as cheating. Proctoring alerts should support human review rather than automatically disqualifying a candidate."*
* **Options Considered:**
  1. **Single-Table Binary Cheating Flags:** Flag every threshold breach directly as a "Cheating Violation" and deduct points from the candidate's score. (Rejected: Violates problem statement, causes high false-positive anxiety, and conflates integrity with technical competency).
  2. **Two-Tier `Observed_Event` vs. `Inferred_Suspicion` Architecture:** All raw deterministic detections (`OBS_TAB_HIDDEN`, `OBS_GAZE_OFF_CENTER`, `OBS_VOICE_WITHOUT_LIP_MOTION`) are logged as factual Tier-1 `OBSERVED_EVENT` records. A sliding-window temporal correlator promotes events to Tier-2 `INFERRED_SUSPICION` *only* when multi-signal or repeated patterns emerge, attaching a mandatory `benign_explanation` field and keeping proctoring completely decoupled from the `1–5` technical rubric score.
* **Decision:** Choose **Option 2 (Two-Tier Telemetry + Human Disposition)**.
* **Consequences:**
  * **Positive:** Eliminates false-alarm penalties on normal candidate behavior, provides recruiters with transparent evidence and alternative explanations, and ensures a human recruiter makes the final disposition (`VERIFIED_CONCERN` vs. `DISMISSED_FALSE_ALARM`).

---

### `ADR-004`: Multi-Layer Display Lockdown (`isExtended` + `displaySurface === "monitor"` + Secondary Cam Physical Monitor Check)
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Candidates frequently cheat in remote interviews by opening AI copilots, documentation, or remote-assistance tools on an extended second monitor, in an unshared browser tab, or in a floating always-on-top overlay window.
* **Options Considered:**
  1. **Page Visibility API (`visibilitychange`) Only:** Detects standard tab switches, but fails completely if the candidate views a second monitor or clicks a floating window while keeping the interview tab visible in the background.
  2. **Custom Native Desktop Lockdown Browser (e.g., Electron / SEB):** Can lock OS processes, but violates the zero-install web-based application deliverable requirement (`Section 6.1`).
  3. **Three-Layer Browser + Visual Display Lockdown:**
     * **Layer 1 (Focus & Hotkey Hooks):** Combine `visibilitychange`, `window.onblur`, `document.hasFocus()` (`5Hz` polling), `fullscreenchange`, and hotkey/clipboard interception (`Alt+Tab`, `Cmd+Tab`, `Ctrl+C/V`).
     * **Layer 2 (OS Display & Full-Screen Share Enforcement):** Query `window.screen.isExtended` and `window.getScreenDetails()` (plus `onscreenschange` hot-plug listeners) to block multi-monitor setups, and enforce `getDisplayMedia` with `displaySurface === "monitor"` (rejecting single-tab or single-window shares).
     * **Layer 3 (Physical Workspace Verification):** Use the **Secondary Smartphone Camera** angled at `45°–60°` behind the candidate running YOLOv8 `monitor`/`laptop` detection to catch hardware HDMI splitters or secondary screens invisible to browser APIs.
* **Decision:** Choose **Option 3 (Three-Layer Browser + Visual Display Lockdown)**.
* **Consequences:**
  * **Positive:** Achieves near-native lockdown security inside a standard zero-install web browser while automatically capturing a high-resolution `10s` screen-share clip the instant any focus blur or tab switch occurs.

---

### `ADR-005`: 3D Iris Trajectory & Reading Sawtooth Wave Classifier Over Naive Gaze Bounding Boxes
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  We must detect **constant eye movement** and candidates reading real-time AI copilot/teleprompter scripts off-screen (`Section 4.5.3.C`), while strictly honoring the requirement not to treat ordinary thinking glances as proof of cheating.
* **Options Considered:**
  1. **Static 2D Face Bounding-Box Center Offset:** Triggers whenever the candidate moves their head slightly, completely misses eye-only reading movements when the head is kept still, and generates `> 40%` false alarms during normal speech formulation.
  2. **30 FPS 3D Iris Vector + Saccade Kinematics & Sawtooth Wave Classifier:** Combines 3D head pose (`solvePnP` Pitch/Yaw/Roll) with MediaPipe's 10 iris landmarks (`468–477`) over a `15-second` rolling buffer to classify three distinct biomechanical signatures:
     * *Natural Cognitive Recall (`< 4.0s` static upward/side glance):* Explicitly ignored (`0%` alert rate).
     * *High-Frequency Constant Eye Darting (`>= 10` rapid saccades `> 120°/s` with dispersion `> 14°` in `15s`):* Flagged as `OBS_HIGH_FREQ_EYE_DARTING`.
     * *Horizontal Reading Saccades (`>= 3` consecutive slow left-to-right sweeps followed by `< 150ms` right-to-left carriage-return snapbacks):* Flagged as `OBS_HORIZONTAL_READING_SACCADE` -> `INF_OFFSCREEN_SCRIPT_OR_COPILOT_READING`.
* **Decision:** Choose **Option 2 (3D Iris Kinematics + Sawtooth Reading Classifier)**.
* **Consequences:**
  * **Positive:** Mathematically separates the biomechanical signature of reading text or darting between screens from natural human thinking glances.

---

### `ADR-006`: Dual-Stage Lip-Sync Verification (`Edge MAR Kinematics` + `Server SyncNet` + `ECAPA-TDNN` Voice Biometrics)
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Remote interviews face sophisticated proxy attacks: (a) an off-screen helper speaking answers while the candidate sits silently, (b) virtual microphone injection of AI-generated/pre-recorded voice while the candidate mimes/lip-syncs, or (c) the candidate silently mouthing questions to an off-screen helper.
* **Options Considered:**
  1. **Simple Audio VAD + Lip Open/Close Threshold:** Easily fooled by a candidate randomly opening and closing their mouth while someone else speaks.
  2. **Cloud-Only Heavy Deepfake Detector on Every Frame:** High latency (`> 3s`) and computationally expensive when the candidate is silent.
  3. **Dual-Stage Kinematic + Neural Audio-Visual Verification with Onboarding Calibration:**
     * **Onboarding Calibration:** Candidate speaks a 3-second calibration phrase to establish their baseline `256-d` `ECAPA-TDNN` speaker voice embedding, natural Mouth Aspect Ratio (`MAR`) dynamic range, and hardware A/V latency offset.
     * **Stage 1 (Edge 30Hz MAR + VAD Filter):** Instantly flags `OBS_VOICE_WITHOUT_LIP_MOTION` (active speech `> 1.8s` with static closed lips `MAR_std < 0.012`) and `OBS_LIP_MOTION_WITHOUT_VOICE` (active mouthing `2–5 Hz` with silent mic).
     * **Stage 2 (Server RTCP-Aligned SyncNet + Speaker Match):** Whenever both voice and lip movement are present, evaluates `0.2s` sliding windows of `96x96` mouth crops against Mel-spectrograms using `SyncNet` (`confidence < 0.32` or offset `> 300ms`) paired with voice embedding cosine distance (`> 0.45`).
* **Decision:** Choose **Option 3 (Dual-Stage MAR + SyncNet + Voice Biometrics)**.
* **Consequences:**
  * **Positive:** Detects all three proxy/lip-sync cheating modes with `< 2.0s` latency while compensating for WebRTC network jitter via RTCP Sender Report (SR) timestamps.

---

### `ADR-007`: Zero-Install Mobile Web PWA with Ephemeral Single-Use JWT QR Handshake for Secondary Camera
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Section `3.E` requires pairing a candidate's smartphone as a secondary workspace camera via QR code without requiring candidates to download a native iOS/Android app.
* **Options Considered:**
  1. **Native Mobile App (React Native / Flutter):** High friction for candidates (App Store install barrier) and unnecessary per Section `3.E`.
  2. **Static Session URL in QR Code:** Insecure; if leaked or scanned twice, allows unauthorized third parties to hijack or view the session stream.
  3. **Zero-Install Mobile Web PWA with Single-Use Redis Nonce JWT + Publish-Only WebRTC Scope:** Desktop UI displays a QR code containing a short-lived (`TTL = 300s`), single-use `HS256` JWT bound to a Redis `SETNX` nonce. Scanning opens mobile Safari/Chrome, exchanges the nonce for a `canPublishSources: ["camera"]` (no audio, no subscribe) LiveKit token, activates the Screen Wake Lock API, and displays a `45°–60°` workspace framing guide.
* **Decision:** Choose **Option 3 (Zero-Install PWA + Ephemeral Single-Use JWT)**.
* **Consequences:**
  * **Positive:** `< 3.0s` scan-to-stream experience on any smartphone, zero acoustic echo (mobile mic disabled), automatic prevent-sleep via Wake Lock, and `< 2.0s` disconnect logging via `1Hz` heartbeat watchdog.

---

### `ADR-008`: Deterministic Finite State Machine (FSM) with Default-10 Fallback & Time-Budgeted Follow-Up Guardrails
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Sections `3.A`, `3.B`, and `3.C` require that: (1) if the recruiter does not specify question count, the system defaults to `10` questions, and (2) adaptive follow-up questions must be bounded so the AI agent never loses track of interview structure or unexpectedly extends the interview duration.
* **Options Considered:**
  1. **Free-Form Autonomous LLM Agent Prompt:** Let a single conversational LLM prompt decide when to ask follow-ups and when to end the interview. (Rejected: LLMs are notorious for losing question counts, looping on a single topic, and blowing past time limits).
  2. **Deterministic Server-Side Finite State Machine (FSM) Governing LLM Calls:**
     * Hard-enforces `question_count = config.question_count or 10` at blueprint creation.
     * Indexes primary questions (`Q1..QN`) separately from follow-ups (`Qi.a`).
     * Evaluates a strict mathematical guardrail before allowing any follow-up:
       $$\text{can\_ask\_followup} = (\text{followup\_idx} < \text{max\_followups}) \land (\text{Remaining\_Time} - \text{Remaining\_Primary\_Qs} \times \text{Avg\_Q\_Time} > 90\text{s})$$
* **Decision:** Choose **Option 2 (Deterministic Server-Side FSM)**.
* **Consequences:**
  * **Positive:** Guarantees `100%` adherence to question counts, interview duration limits, and explicit question states (`PENDING`, `COMPLETED`, `SKIPPED`, `UNANSWERED`) while still providing intelligent, context-aware follow-up probing.

---

### `ADR-009`: Split-Model LLM Strategy (Fast Routing Tier vs. Deep Reasoning Tier)
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Using a frontier reasoning model (`GPT-4o` / `Claude 3.5 Sonnet`) for every live conversational turn transition adds `1.2–2.5s` of latency before TTS can start speaking. Conversely, using a small fast model for post-interview rubric evaluation degrades grading accuracy and nuance.
* **Decision:** Implement a **Two-Tier Split-Model Routing Strategy**:
  1. **Real-Time Conversational Turn Tier (`gpt-4o-mini` / `Claude 3.5 Haiku` with Structured Outputs):** Used during the live interview to classify end-of-turn completeness and generate concise follow-up questions in `< 350ms`.
  2. **High-Reasoning Blueprint & Evaluation Tier (`gpt-4o` / `Claude 3.5 Sonnet`):** Used asynchronously pre-interview (JD-Resume alignment + 10-question blueprint generation) and post-interview (multi-pass `1–5` rubric evaluation, verbatim evidence extraction, and gap synthesis).
* **Consequences:**
  * **Positive:** Achieves natural `< 850ms` voice-to-voice turn latency during the live interview while delivering deep, senior-engineer-grade evaluation quality in the final report.

---

### `ADR-010`: Strict Modality Air-Gap & Transcript Sanitization for Bias-Free Candidate Evaluation
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Section `3.F` explicitly stipulates: *"The system should not rely solely on speaking speed, accent, facial expressions, or appearance to judge candidate quality. Evaluation should focus primarily on the substance of the candidate's responses and predefined job-related criteria."*
* **Options Considered:**
  1. **Multimodal Audio/Video LLM Grading:** Pass raw candidate audio/video directly into a multimodal LLM for grading. (Rejected: Introduces implicit demographic, accent, speaking-rate, and appearance bias, and risks leaking proctoring flags into technical competency scores).
  2. **Architectural Modality Air-Gap & Sanitization Gate:** The `evaluation-worker` is physically isolated from media streams and proctoring tables. It receives *only* consolidated UTF-8 text transcripts (with filler words normalized), word timestamps, the Job Description, the parsed Resume, and the `1–5` scoring rubric, and is forced via Pydantic schema to cite at least one verbatim transcript quote (`[mm:ss]`) for every score assigned.
* **Decision:** Choose **Option 2 (Modality Air-Gap + Mandatory Verbatim Quote Grounding)**.
* **Consequences:**
  * **Positive:** Mathematically guarantees that two candidates giving the exact same technical answer—regardless of accent, speech cadence, or camera appearance—receive identical rubric scores (`Δ <= 0.1` verified in `TRD-T08`).

---

### `ADR-011`: Unified `PostgreSQL 16 + pgvector` + `Redis 7` Over Polyglot Database Sprawl
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  The platform requires ACID relational storage (configs, questions, scores, override audit logs), vector similarity search (`1536-d` question embeddings for `< 0.82` cosine deduplication and `256-d` speaker voice embeddings), and high-frequency time-series state (`10Hz` proctoring sliding windows and QR nonces).
* **Decision:** Standardize on **PostgreSQL 16 with `pgvector`** for all persistent relational, JSONB, and vector data, paired with **Redis 7** for ephemeral FSM state, `SETNX` QR nonces, and `60s` sliding telemetry windows.
* **Consequences:**
  * **Positive:** Eliminates operational complexity and distributed transaction drift between separate relational and vector databases while keeping vector deduplication queries under `< 5ms`.

---

### `ADR-012`: Automated `FFmpeg` 3-in-1 Composite Evidence Clip Slicing with Burned-In Telemetry HUD
* **Status:** Accepted
* **Date:** 2026-10-24
* **Context:**
  Recruiters reviewing 20+ interviews per day do not have time to scrub through three separate 30-minute video files to verify whether a proctoring alert was a false alarm or genuine cheating.
* **Decision:** Whenever a Tier-2 `INFERRED_SUSPICION` or critical `OBSERVED_EVENT` is logged at timestamp $T$, an async `FFmpeg` worker automatically slices $[T - 2\text{s}, T + 8\text{s}]$ across `primary_cam`, `secondary_cam`, and `screen_share`, producing both synchronized individual streams and a ready-to-play **10-second 3-in-1 Composite Evidence Clip** with a visual telemetry overlay (Gaze Vector, Lip MAR vs. Audio Waveform, and Active Display Status).
* **Consequences:**
  * **Positive:** Reduces recruiter verification time per flag to `< 5 seconds` and provides self-contained visual proof for audit compliance.
