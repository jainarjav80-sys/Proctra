# Security, Biometrics & Privacy Specification: Proctra AI Interview Agent

## 1. Compliance, Legal & Ethical Framework

Proctra operates under strict data protection principles adhering to GDPR, CCPA/CPRA, and relevant biometric information privacy frameworks (such as BIPA standards). The platform enforces privacy-by-design across candidate onboarding, real-time computer vision analysis, and candidate evaluation.

### 1.1 Non-Punitive Proctoring Standard
* **Advisory Flags Only:** The AI agent and proctoring engines are strictly prohibited from terminating interviews, disqualifying candidates, or modifying evaluation scores automatically.
* **Human-in-the-Loop Review:** All proctoring indicators are stored as timestamped review items for human recruiters to verify context before making hiring determinations.
* **Separation of Scoring and Monitoring:** The candidate response evaluation engine receives only sanitized text transcripts. Biometric, facial, and acoustic signals have zero influence on the technical competency rating.

---

## 2. Candidate Consent & Onboarding Lifecycle

### 2.1 Multi-Tier Explicit Consent
Before any peripheral media streams are initiated, candidates must pass a mandatory, non-bypassable consent gate.

```
+-----------------------------------------------------------------------+
|                       CANDIDATE ONBOARDING CONSENT                    |
|                                                                       |
|  [x] Audiovisual Capture & AI Speech-to-Text Transcription            |
|      (Processes audio for evaluation; stores session video replay)    |
|                                                                       |
|  [x] Environmental Monitoring & Automated Integrity Review           |
|      (Detects presence, multiple faces, and prolonged gaze deviation) |
|                                                                       |
|  [x] Secondary Smartphone Camera Workspace Verification (Optional)    |
|      (Provides temporary side-angle feed of desk workspace)           |
|                                                                       |
|  [ View Data Retention & Deletion Policy ]                            |
|                                                                       |
|                       [ Agree & Proceed ]                             |
+-----------------------------------------------------------------------+
```

### 2.2 Immutable Consent Audit Trail
Upon clicking "Agree & Proceed", an immutable record is generated and stored:

```json
{
  "consent_id": "cns_9021830129",
  "interview_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "candidate_id": "cand_81c7f5a2",
  "agreed_at": "2026-10-25T00:16:45Z",
  "ip_address": "203.0.113.195",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  "consent_scopes": [
    "AUDIO_RECORDING",
    "VIDEO_RECORDING",
    "AI_TRANSCRIPTION",
    "CV_ENVIRONMENT_PROCTORING",
    "SECONDARY_CAMERA_FEED"
  ],
  "policy_version": "v1.4.2026"
}
```

---

## 3. Ephemeral Secondary Device Handshake Security

Connecting a candidate's smartphone camera must not expose the session to man-in-the-middle attacks, unauthorized injection, or cross-interview leaks.

### 3.1 Handshake Sequence

```
Candidate Desktop Browser           Proctra Auth Service            Candidate Mobile Browser
         |                                   |                                |
         |--- 1. Request Pair Token -------->|                                |
         |<-- 2. Issue Ephemeral Token ------|                                |
         |       (10m TTL, Single Use)       |                                |
         |                                   |                                |
         | [ Renders Dynamic QR Code ]       |                                |
         |                                   |--- 3. Scans QR & Opens URL --->|
         |                                   |<-- 4. Validates Pair Token ----|
         |                                   |--- 5. Issues Scoped Mobile JWT |
         |                                   |    (Role: secondary_cam)       |
         |<========== 6. Direct P2P WebRTC Connection Established ===========>|
         |                                   |                                |
         |-- 7. Invalidate Pair Token ------>|                                |
```

### 3.2 Security Safeguards
1. **Time-To-Live (TTL):** Pairing tokens expire exactly 10 minutes after generation.
2. **One-Time Consumption:** As soon as the mobile device initiates the WebRTC signaling handshake, the pair token is marked consumed in Redis/memory. Subsequent visits return `410 Gone`.
3. **Session Binding:** The secondary mobile client only receives authorization scoped to `stream:secondary` on that specific `interview_id`. It cannot access interview questions, transcripts, or candidate records.
4. **Zero Local Storage:** The mobile web app stores no credentials, tokens, or video frames in `localStorage` or `IndexedDB`. All session credentials live strictly in memory.

---

## 4. Biometric Data Processing & Edge Architecture

To protect candidate biometric rights and minimize sensitive data transmission, the platform uses an edge-first inference approach.

### 4.1 Edge vs. Cloud Processing Boundaries

| Processing Task | Execution Location | Data Transmitted Over Network |
| :--- | :--- | :--- |
| **Face Mesh / Gaze Angle** | Client Browser (MediaPipe / ONNX WebAssembly) | None. Raw vectors remain in client RAM. |
| **Face Count & Presence** | Client Browser (Lightweight ONNX) | Discrete telemetry flags (e.g., `FACE_COUNT: 2`). |
| **Incident Snapshots** | Client Browser -> Storage API | Compressed JPEG frame triggered **only** on violation threshold. |
| **Speech-to-Text** | Encrypted Backend Inference Worker | Encrypted raw audio stream (deleted post-transcription). |
| **Response Evaluation** | Secured LLM Pipeline | Anonymized text transcript (no video or audio data). |

### 4.2 Facial Geometry Protection
* Raw facial landmark points and coordinate meshes are computed transiently frame-by-frame and immediately overwritten in memory.
* The system does **not** store facial biometric templates, generate biometric identity hashes, or perform facial recognition/identity verification across candidates.

---

## 5. Media Storage, Encryption & Retention Lifecycles

### 5.1 Encryption Standards
* **Data in Transit:** All REST and WebSocket traffic uses TLS 1.3. Real-time media feeds over WebRTC utilize SRTP encrypted via DTLS.
* **Data at Rest:** All persisted interview artifacts, snapshots, and database records are encrypted using AES-256-GCM.

### 5.2 Retention & Deletion Schedule

| Data Asset | Storage Medium | Retention Period | Deletion Mechanism |
| :--- | :--- | :--- | :--- |
| **Resume Documents** | Encrypted Object Store | 90 days post-interview | Automated S3 Lifecycle Policy |
| **Full Video Replay** | Encrypted Object Store | 30 days (default) | Hard deletion via automated job |
| **Flagged Incident Snapshots** | Encrypted Object Store | 30 days | Bound to video retention lifecycle |
| **Raw Audio Waveforms** | Transient Worker Memory | 0 seconds (real-time stream) | Discarded immediately after STT buffer |
| **Interview Transcripts** | Relational Database (Encrypted) | 180 days | Soft delete, hard purge at 1 year |
| **Recruiter Audit Logs** | Immutable Log Store | 365 days | Compliance audit archival |

### 5.3 Candidate Data Deletion ("Right to be Forgotten")
Candidates can submit a request for data erasure. The system provides an automated pipeline that:
1. Revokes and invalidates all session tokens.
2. Deletes recorded video files and incident thumbnails from object storage.
3. Redacts candidate identifiers (Name, Email, Resume text) from the database, retaining only anonymized platform performance telemetry.

---

## 6. Incident Response & Tamper Mitigation

* **Camera Tamper Detection:** Black frames or obstructed camera views trigger `SECONDARY_CAM_OCCLUDED` or `NO_FACE_DETECTED` events after 5 seconds of sustained threshold violation.
* **Virtual Camera & Injection Defense:** The web client queries `MediaStreamTrack.getSettings()` and browser device labels to flag generic virtual webcam drivers (e.g., OBS Virtual Camera, ManyCam) as review flags.
* **Network Interruption Grace Period:** Dropouts under 15 seconds are treated as transient connection jitter; no cheating flags are logged, and timers automatically pause to protect candidate fairness.