# Product Design & Requirements Document (PDR)
## Enterprise AI-Powered Video Interview Agent with Dual-Camera Intelligent Proctoring

**Document Status:** Production Release Specification (v1.1 — Enhanced Anti-Cheat & Forensics Edition)  
**Target System:** Autonomous Full-Lifecycle Video Interviewing, Real-Time Dual-Camera & Screen Proctoring, Audio-Visual Lip-Sync Forensics, and Evidence-Based Candidate Assessment Platform  
**Scope:** End-to-End Production Architecture (Beyond Prototype — Enterprise Reliability, Low-Latency Streaming, Privacy-Compliant, and Recruiter-Ready)

---

## 1. Executive Vision & Product Philosophy

Recruitment organizations lose thousands of engineering and HR hours conducting repetitive initial screening interviews that suffer from interviewer fatigue, scheduling bottlenecks, and inconsistent evaluation rubrics. Simultaneously, the shift to remote hiring has introduced severe interview-integrity risks—including off-screen human assistance, secondary lookup devices, real-time LLM/copilot prompting, unauthorized tab switching, extended multi-monitor screen sharing, and proxy/voice-dubbing interviewing—that single-webcam conference tools fail to detect.

This document specifies the **Production Product Design & Requirements (PDR)** for an **Enterprise AI-Powered Video Interview Agent with Intelligent Proctoring**. Unlike a prototype or text-based screening chatbot, this product is a resilient, low-latency, full-lifecycle autonomous interviewing platform. It ingests job descriptions and candidate resumes, conducts adaptive voice-and-video interviews with sub-second conversational turn-taking, pairs a secondary smartphone camera via QR code for 360-degree workspace visibility, enforces full-screen and single-display screen-share lockdown, runs continuous multi-modal computer vision and audio-visual lip-sync forensics, and delivers an auditable, evidence-backed evaluation report for human hiring decisions.

### Core Production Pillars
1. **Autonomous, Context-Aware Conversational Agency:** Real-time full-duplex audio/video interaction with natural turn-taking, barge-in handling, silence recovery, and bounded adaptive follow-up questioning that respects configured time and question budgets.
2. **Multi-Stream Integrity & Anti-Cheat Forensics:** Synchronized primary webcam (frontal face/gaze/lip-sync), desktop full-screen capture (tab/window/extended-display telemetry), and secondary mobile browser camera (workspace/hands/environment) feeds analyzed in real time, strictly separating **Objective Observed Events** from **Inferred Integrity Suspicions**.
3. **Bias-Mitigated, Evidence-Anchored Evaluation:** Structured rubric scoring grounded exclusively in transcript substance, technical accuracy, and demonstrated competencies—explicitly insulated from accent, speaking speed, facial expression, or demographic appearance.
4. **Human-in-the-Loop Recruiter Governance:** AI evaluations and proctoring flags serve as decision-support evidence with one-click video timestamp scrubbing and full recruiter override/audit trails, never automated candidate disqualification.

---

## 2. Comprehensive Traceability Matrix (Problem Statement + Advanced Anti-Cheat to Production Spec)

Every requirement in the Problem Statement—plus the enhanced anti-cheat checks (Tab Change, Extended Screen Share, Constant Eye Movement, and Lip-Sync Verification)—is mapped below to its production-grade engineering specification:

| Problem Statement / Anti-Cheat Area | Core Requirement | Production-Grade Enhancement & Section Reference |
| :--- | :--- | :--- |
| **3.A Configuration & Onboarding** | Job metadata, PDF/DOCX resume upload, skill/project/cert extraction, duration/category/difficulty config, default 10 questions, hardware check & consent. | **Section 4.1 & 4.2:** Asynchronous document parsing pipeline (layout-aware PDF/DOCX OCR fallback), deterministic 10-question fallback rule, cryptographic consent logging, WebRTC loopback diagnostics, display-topology audit, and lighting/framing validation. |
| **3.B AI Question Generation** | JD skill extraction, resume-to-JD matching, technical/behavioral/experience/scenario questions, hybrid recruiter+AI questions, difficulty scaling, deduplication. | **Section 4.3:** Semantic JD-Resume Knowledge Graph alignment, Cosine-similarity deduplication gate (`< 0.82` threshold), Bloom's Taxonomy difficulty calibration, and strict slot allocation for custom recruiter questions. |
| **3.C Autonomous Video Interviewer** | Virtual interviewer UI, TTS output, STT capture, natural audio + continuous video, bounded adaptive follow-ups, time limits, silence/interruption/network recovery, state tracking. | **Section 4.4:** Streaming WebRTC + Server-Side Media Agent (SFU), sub-800ms voice-to-voice latency, Silero VAD endpointing, finite state machine (FSM) governing `Completed`, `Skipped`, and `Unanswered` states, and hard budget caps on follow-up depth. |
| **3.D Intelligent Anti-Cheating & Proctoring** | Face presence, multiple-person detection, head pose/gaze indicators, audio monitoring, pattern correlation, hardware status monitoring, incident logging with evidence, observed vs. inferred separation. | **Section 4.5:** Dual-tier edge + server CV/Audio pipeline, 3D Euler head-pose & iris vector tracking with cognitive-look-away grace windows, multi-speaker diarization, sliding-window anomaly aggregator, and two-tier `Observed_Event` vs. `Inferred_Suspicion` schema. |
| **Enhanced Anti-Cheat 1: Tab Change & Focus Lockdown** | Detect any browser tab switches, window focus loss, minimization, or clipboard/shortcut usage during the interview. | **Section 4.5.3.A:** Page Visibility API (`visibilitychange`), Window `blur`/`focus` telemetry, Fullscreen API enforcement, keyboard shortcut interception (`Alt+Tab`, `Cmd+Tab`, DevTools, Copy/Paste), paired with instant screen-share frame capture. |
| **Enhanced Anti-Cheat 2: Extended Screen Share & Multi-Monitor Detection** | Detect extended/secondary monitors, virtual displays, or partial tab/window screen sharing instead of full-screen share. | **Section 4.2 & 4.5.3.B:** Window Management API (`window.screen.isExtended`), `getDisplayMedia` surface verification (`displaySurface === "monitor"` mandatory), EDID/resolution change listeners, and Secondary Camera cross-verification of physical desk monitors. |
| **Enhanced Anti-Cheat 3: Constant Eye Movement & Saccade Tracking** | Detect continuous darting eye movements, horizontal reading saccades (AI copilot/teleprompter reading), and high-frequency gaze oscillation. | **Section 4.5.3.C:** 30 FPS MediaPipe Iris 3D vector tracking (`landmarks 468–477`), angular velocity & saccade rhythm analyzer distinguishing natural cognitive thinking glances from line-by-line text scanning and rapid darting. |
| **Enhanced Anti-Cheat 4: Lip-Sync & Audio-Visual Voice Correlation** | Detect proxy interviewing, pre-recorded audio injection, or off-screen coaching where spoken audio does not match candidate lip movement. | **Section 4.5.3.D:** Real-time Mouth Aspect Ratio (MAR) optical kinematics + SyncNet audio-visual cross-correlation measuring phoneme-to-viseme alignment (`AV_Offset_ms` and `MAR-VAD Correlation`), flagging voice-without-lips and lips-without-voice anomalies. |
| **3.E Secondary Smartphone Camera** | QR code display, mobile web page (zero-app), temporary token pairing, live streaming to monitor UI, dual-feed analysis, disconnect logging, placement guide, explicit dual-feed consent. | **Section 4.6:** Ephemeral JWT/WebSocket handshake, mobile browser WebRTC publisher with wake-lock & orientation guides, cross-camera person/device/monitor correlation, sub-2s disconnect detection, and automated reconnection grace workflow. |
| **3.F AI-Based Candidate Evaluation** | Response transcription/summarization, correctness/relevance/completeness scoring, JD competency comparison, configurable 1–5 rubric, multi-dimensional breakdown, strengths/gaps, verbatim evidence, bias exclusion. | **Section 4.7:** Multi-pass LLM judge with deterministic rubric anchors (1–5 scale), mandatory verbatim transcript quote citations per score, strict acoustic/visual feature stripping to prevent demographic/accent bias, and structured gap analysis. |
| **3.G Report & Recruiter Dashboard** | Candidate/job metadata, status/duration, Q&A transcripts, summaries & scores, skills/gaps, proctoring timeline, synchronized video segments, recruiter review/override controls. | **Section 4.8:** Interactive multi-stream player (Primary Cam + Secondary Cam + Screen Share) with event markers, lip-sync/gaze/tab telemetry inspector, immutable audit log for recruiter score overrides, and PDF/JSON/ATS export. |

---

## 3. End-to-End System Architecture

To operate as a reliable final product capable of handling concurrent interviews without browser crashes or network drops, the platform uses a **Hybrid Edge-Cloud Microservices Architecture** backed by a **WebRTC Selective Forwarding Unit (SFU)**.

### 3.1 High-Level Component Topology

```
+---------------------------------------------------------------------------------------------------+
|                                     CLIENT TIER (BROWSERS)                                        |
|                                                                                                   |
|  +-------------------------+  +------------------------------------+  +------------------------+  |
|  |  Recruiter Web Portal   |  |    Candidate Primary Desktop UI    |  | Candidate Secondary Cam|  |
|  | (Next.js / TypeScript)  |  | - WebRTC Cam + Mic + Full Screen   |  | (Mobile Web PWA/WebRTC)|  |
|  | - Multi-Stream Player   |  | - Edge CV: Face, Iris Gaze, Lip MAR|  | - Rear/Wide Workspace  |  |
|  | - Rubric & Override UI  |  | - Tab/Focus & Extended Screen Guard|  | - WakeLock & Angle UI  |  |
|  +------------+------------+  +-----------------+------------------+  +-----------+------------+  |
+---------------|---------------------------------|---------------------------------|---------------+
                | HTTPS / WSS                     | WSS / WebRTC (Cam+Mic+Screen)   | WSS / WebRTC
                v                                 v                                 v
+---------------------------------------------------------------------------------------------------+
|                                  API GATEWAY & REAL-TIME EDGE                                     |
|                                                                                                   |
|  +-----------------------------+  +------------------------------------------------------------+  |
|  |   REST / GraphQL Gateway    |  |      WebRTC SFU & Signaling Server (LiveKit / Mediasoup)   |  |
|  | (Auth, RBAC, Rate Limiting) |  | (Multi-Track Room: Primary A/V, Screen V, Secondary V, AI) |  |
|  +--------------+--------------+  +---------------+----------------------------+---------------+  |
+-----------------|---------------------------------|----------------------------|------------------+
                  |                                 | Media & Telemetry Tracks   | Media Tracks
                  v                                 v                            v
+---------------------------------------------------------------------------------------------------+
|                                   CORE APPLICATION SERVICES                                       |
|                                                                                                   |
|  +-----------------------------+  +-------------------------------+  +-------------------------+  |
|  | 1. Ingestion & Blueprint    |  | 2. Real-Time Interview Agent  |  | 3. Intelligent Proctor  |  |
|  |    Service                  |  |    Orchestrator               |  |    & Forensics Engine   |  |
|  | - PDF/DOCX Layout Parser    |  | - Interview FSM & Turn Manager|  | - Face/Multi-Person CV  |  |
|  | - Skill/Entity Extractor    |  | - Streaming STT (Deepgram)    |  | - Iris Saccade & Gaze   |  |
|  | - Question Generator &      |  | - Adaptive Conversational LLM |  | - Lip-Sync (SyncNet/MAR)|  |
|  |   Deduplication Engine      |  | - Streaming TTS + Avatar Sync |  | - Tab & Display Guard   |  |
|  +--------------+--------------+  +---------------+---------------+  +------------+------------+  |
|                 |                                 |                               |               |
|                 +---------------------------------+-------------------------------+               |
|                                                   | Event Bus (Kafka / Redis Streams)             |
|                                                   v                                               |
|  +---------------------------------------------------------------------------------------------+  |
|  | 4. Post-Interview Evaluation, Rubric Scoring & Report Aggregation Service                   |  |
|  | - Transcript Aligner & Summarizer        - Evidence-Grounded LLM Evaluator (1-5 Rubric)     |  |
|  | - Bias Mitigation Sanitizer              - Multi-Track Video Muxer & Evidence Clip Builder  |  |
|  +------------------------------------------------+--------------------------------------------+  |
+---------------------------------------------------|-----------------------------------------------+
                                                    v
+---------------------------------------------------------------------------------------------------+
|                                    DATA & STORAGE PERSISTENCE                                     |
|                                                                                                   |
|  +-----------------------+  +-----------------------+  +-------------------+  +----------------+  |
|  |     PostgreSQL        |  |   pgvector / Qdrant   |  |   Redis Cluster   |  | S3 Object Store|  |
|  | (Relational Entities, |  | (Embeddings, Semantic |  | (Session State,   |  | (Resumes, 3x   |  |
|  |  Scores, Audit Logs)  |  |  Skill & Q Dedup)     |  |  QR Tokens, FSM)  |  |  Videos, Clips)|  |
|  +-----------------------+  +-----------------------+  +-------------------+  +----------------+  |
+---------------------------------------------------------------------------------------------------+
```

### 3.2 Recommended Production Technology Stack

| Layer | Technology Choice | Production Rationale |
| :--- | :--- | :--- |
| **Frontend (Recruiter & Candidate)** | Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS, Shadcn UI | Strict type safety, SSR for dashboard speed, Screen Management & Page Visibility hooks, and responsive mobile web view for secondary camera. |
| **Client-Side Edge AI** | MediaPipe Face Landmarker (`478` 3D points + Iris `468–477` + Lip Contours), Silero VAD (ONNX Runtime Web) | Runs at 30 FPS via WebGPU/WASM in a dedicated Web Worker to compute real-time 3D head pose, iris saccade velocity, and Mouth Aspect Ratio (MAR) synchronized with local audio energy. |
| **Real-Time Media & Signaling** | LiveKit (Open-Source WebRTC SFU) + WebSockets | Multi-track WebRTC SFU handling 4 concurrent tracks per session (Primary Cam, Primary Mic, Entire Desktop Screen Share, Secondary Mobile Cam) with synchronized Egress recording. |
| **Speech-to-Text (STT)** | Deepgram Nova-2 Streaming API (or self-hosted Faster-Whisper on GPU) | Sub-300ms streaming transcription latency, word-level timestamps, filler-word preservation, and multi-speaker diarization support. |
| **Text-to-Speech (TTS) & Avatar** | Cartesia Sonic / ElevenLabs Turbo v2.5 + WebGL/2D Lip-Sync Avatar (or LivePortrait/HeyGen WebRTC stream) | Sub-250ms time-to-first-audio-byte (TTFB) with viseme/phoneme timestamps to drive realistic virtual interviewer lip synchronization. |
| **LLM Orchestration** | GPT-4o / Claude 3.5 Sonnet (Structured Outputs) + LangGraph | Deterministic state-machine orchestration for question generation, low-latency follow-up decisions (`gpt-4o-mini` / `haiku` for <500ms turn routing), and high-reasoning evaluation (`gpt-4o` / `sonnet`). |
| **Server-Side CV & Audio-Visual Forensics** | Python FastAPI Worker, YOLOv8x (Person/Device/Monitor Detection), PyAnnote Audio (Speaker Diarization), SyncNet / Wav2Lip Discriminator | Validates client telemetry on sampled server streams, verifies audio-visual lip-sync coherence against voice spoofing/dubbing, and detects secondary monitors or persons across feeds. |
| **Backend & Task Queue** | FastAPI (Python 3.11+) + Celery / Temporal.io | Asynchronous execution of heavy workflows (resume parsing, multi-track video transcoding, post-interview rubric evaluation) with guaranteed retry semantics. |
| **Databases & Storage** | PostgreSQL 16 + `pgvector`, Redis 7, AWS S3 / MinIO (Encrypted) | ACID compliance for interview records and audit logs, vector similarity for question deduplication, sub-millisecond session locks, and encrypted blob storage for media evidence. |

---

## 4. Detailed Functional Specifications (Modules A–G)

### 4.1 Module A1: Interview Configuration & Resume/JD Ingestion Engine

#### 4.1.1 Recruiter Job & Interview Configuration Interface
Recruiters configure an interview template or single-candidate session with the following parameters:
* **Job Metadata:**
  * `job_title` (Required, String, e.g., *"Senior Backend Engineer - Distributed Systems"*)
  * `job_description` (Required, Rich Text / Markdown, 50–15,000 characters)
  * `required_skills` (Structured array of tags with weightings: `Mandatory` vs. `Preferred`)
  * `experience_level` (Enum: `Intern`, `Entry (0-2 yrs)`, `Mid (2-5 yrs)`, `Senior (5-8 yrs)`, `Staff/Principal (8+ yrs)`)
  * `department_and_role_context` (Optional notes on team stack, domain, and deliverables)
* **Interview Structure Parameters:**
  * `total_duration_minutes` (Configurable integer, range: `10` to `90` minutes; default: `30` minutes)
  * `total_question_count` (Configurable integer, range: `3` to `25`; **strict system rule: if omitted or left blank by the recruiter, automatically defaults to `10` questions**)
  * `question_categories_distribution` (Configurable percentage or count split across: `Technical`, `Behavioral`, `Experience-Based`, and `Scenario/System-Design`)
  * `difficulty_level` (Enum: `Foundational`, `Intermediate`, `Advanced`, `Adaptive-To-Experience`)
  * `follow_up_policy` (Configurable: `Disabled`, `Max 1 Follow-Up Per Primary Question`, `Max 2 Follow-Ups Within Time Budget`)
  * `response_time_limit_seconds` (Per-question max answer duration, default: `180` seconds)
  * `secondary_camera_requirement` (Enum: `Mandatory`, `Recommended (Optional Fallback)`, `Disabled`)
  * `anti_cheat_strictness_profile` (Configurable toggles for: `Enforce Full-Screen & Entire-Monitor Share`, `Block Extended Displays`, `Tab-Switch Warning Limit`, `Enable Continuous Eye-Saccade Tracking`, and `Enable Lip-Sync Voice Verification`)
  * `scoring_rubric_config` (Default 1–5 scale across customizable competency dimensions and custom weights)

#### 4.1.2 Resume Upload & Structured Information Extraction Pipeline
1. **Supported Formats & Validation:** Accepts `.pdf` and `.docx` files up to 15 MB. Performs MIME-type magic-byte inspection and virus/macro sanitization upon upload.
2. **Multi-Stage Document Parsing:**
   * **Native Text Layer:** Uses `pypdf`/`pdfplumber` (for PDFs) and `python-docx` (for DOCX) to preserve reading order, tables, and multi-column layouts.
   * **OCR Fallback:** If extracted character density is `< 50 chars/page` (scanned PDF), routes automatically through Tesseract/PaddleOCR.
3. **Structured Entity Extraction Schema (LLM Structured JSON Output):**
   * **Candidate Profile:** Full Name, Email, Phone, Location, Portfolio/GitHub/LinkedIn links.
   * **Skills Inventory:** Normalized taxonomy mapping each extracted skill to `Category` (Language, Framework, Cloud, Database, Soft Skill), `Claimed Proficiency`, and `Source Evidence` (which project or role mentioned it).
   * **Professional Experience:** Array of roles with `Company`, `Title`, `Start_Date`, `End_Date`, `Calculated_Duration_Months`, `Key_Responsibilities`, and `Quantified_Achievements`.
   * **Projects:** Project Name, Tech Stack Used, Architecture/Problem Solved, Role.
   * **Education & Certifications:** Degree, Institution, Graduation Year, GPA/Honors, and Verified/Claimed Certifications (e.g., AWS Solutions Architect, CKA).

---

### 4.2 Module A2: Candidate Onboarding, Hardware Diagnostics, Display Lockdown & Consent Flow

Before the interview clock starts, the candidate progresses through a mandatory, step-gated onboarding wizard:

1. **Step 1 — Welcome & Explicit Informed Consent:**
   * Displays job role, estimated duration, number of questions, and clear interview rules (single display only, full-screen lock, no tab switching, no external materials or AI copilots, no secondary assistance, stay within camera frame).
   * Presents explicit, itemized consent checkboxes for:
     1. Primary audio, frontal video, and full-screen display recording.
     2. Secondary smartphone workspace camera streaming and recording.
     3. Automated AI transcription, response evaluation, and multi-modal proctoring analysis (including browser tab/display monitoring, eye-movement tracking, and audio-visual lip-sync verification).
   * Logs an immutable `ConsentRecord` (`timestamp`, `candidate_ip`, `user_agent`, `consent_version_hash`). Candidates who decline may exit gracefully and notify the recruiter.
2. **Step 2 — Primary Camera, Microphone & Lip-Sync Baseline Calibration:**
   * Requests `navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 }, audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } })`.
   * **Video & Face Mesh Check:** Runs a 3-second framing and lighting check—verifying exactly one face is centered, luminance is adequate (`mean_pixel_luma > 45`), and both eyes and lips are clearly visible without heavy backlight or face coverings.
   * **Audio Loopback & Lip-Sync Calibration:** Prompts candidate to read a calibration sentence aloud while looking at the camera (*"I confirm that I am taking this interview independently"*). This captures:
     * Microphone SNR (`> 15 dB`) and baseline speaker voice embedding (`256-d Resemblyzer/ECAPA-TDNN vector`).
     * Baseline **Audio-Visual Lip-Sync Calibration Profile** (candidate's natural Mouth Aspect Ratio dynamic range and hardware audio/video pipeline latency offset).
3. **Step 3 — Display Topology Audit, Extended Screen Check & Full-Screen Share Enforcement:**
   * **Multi-Monitor / Extended Screen Detection:** Queries `window.screen.isExtended` and the Window Management API (`window.getScreenDetails()`). If an extended monitor, HDMI dummy plug, Sidecar/AirPlay display, or DisplayLink adapter is detected (`isExtended === true` or `screens.length > 1`), the onboarding gate halts and instructs the candidate to unplug or disable all secondary/extended displays before proceeding.
   * **Mandatory Entire-Screen Share (`getDisplayMedia`):** Prompts the candidate to share their screen via `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor" } })`.
   * **Surface Inspection Gate:** Inspects `videoTrack.getSettings().displaySurface`. If the candidate selects a single browser `tab` or `window` instead of the entire `monitor`, the system rejects the stream and re-prompts until full-monitor sharing is active.
   * **Fullscreen Lockdown:** Enters browser Fullscreen mode (`document.documentElement.requestFullscreen()`) and binds continuous focus and visibility listeners.
4. **Step 4 — Secondary Smartphone Camera Pairing (Module E Integration):**
   * Renders a dynamic, time-bound QR code on the desktop screen and walks the candidate through placing their smartphone at a 45–90 degree side/rear angle showing their desk, hands, and monitor (confirming visually that no secondary monitors or hidden devices exist on the desk).

---

### 4.3 Module B: AI-Based Interview Question Generation Engine

#### 4.3.1 Semantic Alignment & Gap Mapping
Upon ingestion of the Job Description (JD) and Candidate Resume, the Question Generation Engine executes a **3-step alignment pipeline**:
1. **JD Decomposition:** Extracts core technical skills, architectural responsibilities, domain requirements, and seniority expectations.
2. **Resume-to-JD Cross-Reference Matrix:** Categorizes every JD requirement into one of three buckets:
   * **Matched & Claimed (`Verify Depth`):** Candidate explicitly claims the skill on their resume (e.g., JD requires *Java, Spring Boot, Microservices*; resume lists a fintech backend built with *Spring Boot & Kafka*). Target: Deep probing questions referencing their specific project to verify authentic hands-on experience versus resume keyword stuffing.
   * **Adjacent / Transferable (`Assess Adaptability`):** Candidate has equivalent experience (e.g., JD asks for *RabbitMQ*, resume shows *Apache Kafka*). Target: Conceptual trade-off questions.
   * **Unmentioned / Gap (`Baseline Screening`):** Required by JD but absent from resume. Target: Foundational conceptual questions to test baseline knowledge.

#### 4.3.2 Multi-Category Question Blueprint & Default-10 Rule
* **Question Count Resolution:**
  ```python
  target_question_count = config.total_question_count if config.total_question_count is not None else 10
  ```
* **Hybrid Recruiter + AI Question Merging:**
  * If the recruiter defines `M` mandatory custom questions (`M <= target_question_count`), those `M` questions are locked into their designated category slots verbatim, and the AI generates the remaining `N = target_question_count - M` questions.
  * If `M > target_question_count`, the UI prompts the recruiter during configuration to either increase the total count or select which custom questions to include.
* **Category Allocation (Default 10-Question Distribution if unspecified):**
  1. **Technical Questions (40% / 4 questions):** Deep-dive verification of core stack (e.g., concurrency in Java, Spring Boot bean lifecycle, distributed transactions).
  2. **Experience-Based Questions (20% / 2 questions):** Grounded directly in a named project or past employment role from the candidate's resume.
  3. **Scenario / Problem-Solving Questions (20% / 2 questions):** Production debugging, architecture trade-offs, or incident response scenarios tailored to the role's seniority.
  4. **Behavioral & Communication Questions (20% / 2 questions):** Collaboration, conflict resolution, ownership, and ambiguity handling aligned with role level.

#### 4.3.3 Difficulty Calibration & Anti-Duplication Gate
* **Difficulty Scaling:** Calibrated via Bloom's Taxonomy based on `experience_level` (e.g., *Entry* focuses on application and debugging fundamentals; *Senior* focuses on system trade-offs, failure modes, and scalability bottlenecks).
* **Semantic Deduplication Gate:** Every generated question (plus recruiter-defined questions) is embedded via `text-embedding-3-small`. If any pair of questions exhibits a cosine similarity `>= 0.82` or tests the exact same sub-skill concept, the generator automatically regenerates the redundant slot until all questions are mutually distinct.
* **Hidden Evaluation Anchor Generation:** Along with each question, the engine pre-generates an internal `Expected_Answer_Rubric` (key technical points, red flags/misconceptions, and ideal follow-up triggers) stored strictly server-side for the interviewer agent and post-interview evaluator.

---

### 4.4 Module C: Autonomous AI Video Interviewer & Conversational Engine

#### 4.4.1 Virtual Interviewer UI & Full-Duplex Media Architecture
The candidate interview screen provides an intuitive, distraction-free workspace locked in Fullscreen mode:
* **Center Stage:** Interactive Virtual Interviewer Avatar (clean visual representation or synchronized lip-sync video avatar) with real-time audio waveform visualizer and optional closed-caption display of the current question.
* **Picture-in-Picture (PiP) Integrity Dock:** Live preview of the candidate's Primary Camera (with real-time framing & lip-sync status border), Screen-Share Active badge, and Secondary Smartphone Camera status indicator (`Connected - Live`).
* **Progress & Timer Bar:** Displays Question `X of N`, per-question countdown timer, overall interview elapsed/remaining time, and a manual *"I've Finished My Answer"* button alongside hands-free voice detection.

#### 4.4.2 Real-Time Conversational Turn-Taking & Bounded Adaptive Follow-Ups
The interview is governed by a deterministic **Server-Side Finite State Machine (FSM)**:

```
[INTRO & RULES] 
      │
      ▼
[LOAD NEXT PRIMARY QUESTION (i = 1..N)]
      │
      ▼
[AI SPEAKS QUESTION (TTS Stream)] ──(Candidate Barge-In Detected)──► [PAUSE TTS & LISTEN]
      │
      ▼
[LISTENING & STREAMING STT] ◄───(Brief Pause < 2.2s: Wait)───┐
      │                                                      │
      ├──(Silence > 3.0s & Semantic Completeness = True)─────┤
      ├──(Silence > 5.0s: Prompt "Would you like to add...")─┘
      ├──(Response Timer Expired or Candidate Clicks "Done")
      ▼
[EVALUATE TURN FOR FOLLOW-UP]
      │
      ├──► (Criteria Met: Answer Incomplete/Surface-Level AND Follow_Up_Count < Max_Allowed 
      │     AND Remaining_Interview_Time > Buffer_Threshold)
      │          │
      │          ▼
      │    [GENERATE & ASK CONTEXTUAL FOLLOW-UP] ──► (Return to LISTENING; Increment Follow_Up_Count)
      │
      └──► (Criteria Not Met OR Follow-Up Budget Exhausted)
                 │
                 ▼
      [UPDATE QUESTION STATUS (Completed / Skipped / Unanswered)]
                 │
                 ▼
      [ADVANCE TO i + 1 OR CONCLUDE INTERVIEW]
```

#### 4.4.3 Strict Governance of Follow-Up Questions & Time Budgets
To satisfy the requirement that *"follow-up questions should be handled according to the interview settings so that the agent does not unexpectedly extend the interview"*:
1. **Primary vs. Follow-Up Indexing:** If a recruiter configures `10` questions, the system asks exactly `10` primary questions (`Q1` through `Q10`). Follow-ups are sub-indexed (`Q1.a`, `Q1.b`) and bounded by `max_follow_ups_per_question` (default `1`).
2. **Dynamic Time-Budget Guardrail:** Before triggering any follow-up `Qi.a`, the orchestrator calculates:
   $$\text{Remaining Time} - (\text{Remaining Primary Questions} \times \text{Avg Question Time})$$
   If the remaining time buffer is `< 90 seconds`, adaptive follow-ups are automatically suppressed so all remaining primary questions can be asked within the scheduled interview duration.
3. **Contextual Continuity:** The orchestrator maintains a rolling `Interview_Context_Memory` summarizing the candidate's prior claims (e.g., if in `Q2` the candidate mentions migrating a monolith to Kubernetes, the agent can reference that specific migration in `Q5` without repeating earlier questions).

#### 4.4.4 Edge-Case Resilience (Silence, Unclear Audio, Interruptions, Disconnections)
* **Extended Silence / Freezing:**
  * At `8 seconds` of initial silence after a question: Agent gently prompts, *"Take your time—let me know if you'd like me to repeat or rephrase the question."*
  * At `20 seconds` of continued silence: Agent offers to rephrase or skip to the next question. If no response by `30 seconds`, marks question as `Unanswered` and advances.
* **Unclear Audio / Low STT Confidence:** If STT word-confidence drops below `0.60` or audio clipping occurs, the agent politely intervenes: *"Your audio broke up slightly for a moment—could you repeat that last part about [last clear phrase]?"*
* **Candidate Barge-In / Interruption:** Full-duplex VAD detects sustained candidate speech (`> 400ms`) while TTS is playing, immediately halting TTS playback so the conversation feels natural.
* **Temporary Network Drop:** Session state is persisted in Redis after every utterance. If the candidate's WebRTC connection drops, the interview timer pauses for up to `5 minutes`. Upon reconnection, the agent resumes seamlessly from the exact current question state without losing prior recordings or transcripts.
* **Explicit Question State Tracking:** Every primary question is tracked in real time as:
  * `PENDING`: Not yet asked.
  * `IN_PROGRESS`: Currently active.
  * `COMPLETED`: Candidate provided a substantive response.
  * `SKIPPED`: Candidate explicitly requested to skip.
  * `UNANSWERED`: Timed out with silence or zero substantive content.

---

### 4.5 Module D: Intelligent Anti-Cheating & Multi-Modal Proctoring Engine

#### 4.5.1 Philosophical & Architectural Separation: `Observed Event` vs. `Inferred Suspicion`
A core defect of naive proctoring tools is equating a single raw sensor trigger (e.g., glancing upward while thinking or a brief lip hesitation) with "cheating." Our production architecture enforces a strict **Two-Tier Telemetry & Reasoning Model**:

1. **Tier 1 — Objective `Observed_Event` (Deterministic Sensor Telemetry):**
   * Factual, non-accusatory measurements recorded with start/end millisecond timestamps, duration, confidence score, and media keyframes (e.g., *"Browser tab visibility changed to `hidden` for 6.4 seconds"*, *"Iris horizontal saccade scanning detected at 4.2 Hz for 5.5 seconds"*, or *"Audio speech detected for 4.8 seconds while Mouth Aspect Ratio variance remained < 0.015"*).
2. **Tier 2 — Correlated `Inferred_Suspicion` (Temporal Pattern Aggregator):**
   * Triggered **only** when multiple `Observed_Events` form a statistically significant pattern over a sliding window or align with high-risk interview phases (e.g., *"Tab switch followed immediately by constant horizontal reading eye movements during Question 4"* or *"Sustained lip-sync desynchronization correlated with secondary voice embedding"*).
   * Every `Inferred_Suspicion` includes a transparent `Confidence_Level` (`Low`, `Medium`, `High`), `Alternative_Benign_Explanations` (e.g., *"Network packet jitter may cause temporary A/V offset"*), and a link to the synchronized multi-stream video clip for human recruiter verification. **Zero automated candidate disqualification occurs.**

#### 4.5.2 Comprehensive Detection Modalities, Thresholds & False-Alarm Mitigation

| Proctoring Modality | Technical Method | Observed Event Trigger | Inferred Suspicion Escalation Rule & False-Alarm Guardrail |
| :--- | :--- | :--- | :--- |
| **1. Tab Change & Window Focus Lockdown** | Page Visibility API (`document.hidden`), `window.onblur`, Fullscreen API (`fullscreenchange`), Keyboard Hook (`Alt+Tab`, `Cmd+Tab`, `Ctrl+C/V`) | Browser tab hidden, window loses focus (`> 500ms`), fullscreen exited, or clipboard paste/hotkey triggered. | **Single Brief Blur (`< 2s`):** Logged as `LOW` `OBSERVED_EVENT` (e.g., OS notification popup) with automatic desktop screen-share frame capture.<br>**Repeated / Prolonged Tab Switch (`> 3s` or `>= 2` times):** Escalates to `HIGH` `INFERRED_SUSPICION` with exact screen-share recording showing what tab/application the candidate switched to. |
| **2. Extended Screen Share & Multi-Monitor Detection** | `window.screen.isExtended`, `getScreenDetails()`, `getDisplayMedia` (`displaySurface === 'monitor'`), Secondary Cam YOLOv8 Monitor Detector | `isExtended === true`, `screens.length > 1`, screen share stopped/downgraded from full monitor, or secondary camera spots an extra physical screen. | **Hard Gate + Live Monitor:** Blocks interview start if extended display is active. If hot-plugged mid-interview (`screens.onscreenschange`), immediately pauses question, logs `EXTENDED_SCREEN_DETECTED` (`HIGH`), and cross-checks gaze direction toward the second display. |
| **3. Constant Eye Movement, Saccade & Gaze Tracking** | 30 FPS MediaPipe Iris (`landmarks 468–477`) 3D Gaze Vector + Saccade Angular Velocity & Horizontal Line-Return Classifier | Continuous off-center gaze (`> 4.0s`), rapid darting (`> 12 gaze shifts / 15s`), or rhythmic horizontal left-to-right reading saccades (`3–5 sweeps` with carriage-return snapback). | **Cognitive Gaze Grace Filter:** Static upward/sideways thinking glances (`< 4.0s`) without reading saccades are ignored as natural cognitive recall.<br>**Teleprompter / AI Copilot Flag:** Escalates to `HIGH` `INFERRED_SUSPICION` when rhythmic horizontal reading eye movement or constant darting occurs while the candidate is speaking or right after a question ends. |
| **4. Lip-Sync & Audio-Visual Voice Correlation** | Real-Time Mouth Aspect Ratio (`MAR`) Kinematics + Server-Side SyncNet / Wav2Lip Audio-Visual Discriminator + Voice Biometric Match | **(a) Voice Without Lip Movement:** Active speech (`VAD = True` for `> 1.8s`) while candidate's lips are closed/static (`MAR_std < 0.012`).<br>**(b) Lip Movement Without Voice:** Candidate mouths words silently (`MAR > 0.18` oscillation) while `VAD = False` (whispering to off-screen helper/AI).<br>**(c) A/V Phase Desync:** Audio-visual correlation score `< 0.35` or offset `> 300ms` (adjusted for WebRTC RTP jitter). | **Packet Jitter Guardrail:** Computes cross-correlation over a sliding `2.0s` RTP timestamp-aligned buffer to ignore network lag.<br>**Proxy / Dubbing Flag:** Escalates to `HIGH` `INFERRED_SUSPICION` (`LIP_SYNC_MISMATCH`) when speech occurs with static lips, silent mouthing precedes an answer, or SyncNet detects dubbed/synthetic audio. |
| **5. Face Presence Detection** | MediaPipe BlazeFace + Server YOLOv8 Verification | Primary camera detects `0 faces` continuously for `> 3.0 seconds`. | **Low Alert:** Absence `3–10s` (e.g., adjusting chair/dropping pen).<br>**High Alert:** Absence `> 10s` or repeated absences (`>= 3` times) during active questioning. |
| **6. Multiple-Person Detection** | Dual-Feed YOLOv8x Person Detector + Face Landmarker (`num_faces > 1`) | `>= 2` distinct faces in Primary Camera OR `>= 2` persons detected in Secondary Camera workspace view for `> 1.5 seconds`. | **Immediate Review Flag:** Captures dual-camera snapshot. Distinguishes brief background passerby (`< 3s`, moving away) from stationary second person in room (`> 4s`). |
| **7. Audio Monitoring & Multi-Voice Forensics** | Silero VAD + PyAnnote Speaker Diarization + Resemblyzer Baseline Comparison | Secondary speaker voice embedding (`cosine_distance > 0.45` from candidate onboarding voice) OR low-amplitude whisper during silence. | **Review Flag:** Logs timestamped audio snippet when a second distinct voice is detected or when background speech precedes candidate answers. Ignores non-speech environmental noise (HVAC, traffic). |
| **8. Unauthorized Device / Material Detection** | Secondary Camera YOLOv8 Object Detection (Cell phone, tablet, secondary laptop, physical notes/books) | Secondary camera detects unauthorized screen/phone in candidate's hand or desk area outside the permitted primary display. | **Review Flag:** Cross-references primary camera eye gaze with secondary camera object detection to highlight unauthorized lookup material. |
| **9. Camera & Microphone Status Integrity** | WebRTC `onmute`/`onended` listeners, MediaStreamTrack state inspection | Primary camera, microphone, screen-share track, or secondary mobile camera muted, covered (`luma < 10`), or disconnected. | **Immediate Incident Log:** Records exact millisecond of hardware interruption, prompts candidate in real time to restore feed, and pairs with answer timing. |

#### 4.5.3 Deep-Dive Engineering Specifications for the 4 Enhanced Anti-Cheat Subsystems

##### A. Tab Change, Window Focus & Browser Lockdown Engine
1. **Multi-Hook Event Capture:**
   * **Visibility State:** Listens to `document.addEventListener("visibilitychange")` to capture instant tab switches or browser minimization (`document.visibilityState === "hidden"`).
   * **Window Focus Loss:** Listens to `window.addEventListener("blur")` and `document.hasFocus()` polling (`200ms` interval) to detect when the candidate clicks into a floating overlay window, sticky note, or secondary application even if the browser tab remains visible behind it.
   * **Fullscreen Exit:** Listens to `document.addEventListener("fullscreenchange")`. Exiting fullscreen triggers an immediate on-screen modal warning requiring a single click to re-enter fullscreen within `5 seconds`.
   * **Input & Clipboard Telemetry:** Intercepts `keydown` combinations (`Alt+Tab`, `Cmd+Tab`, `Ctrl+Shift+I`, `F12`, `PrintScreen`, `Ctrl+C`, `Ctrl+V`) and `paste` events.
2. **Synchronized Screen-Share Evidence Capture:**
   * Because the candidate is simultaneously streaming their full monitor via `getDisplayMedia`, the exact millisecond a `TAB_SWITCH` or `WINDOW_BLUR` occurs, the server extracts a high-resolution keyframe and a `10-second` video clip from the **Screen-Share Track**—giving the recruiter visual proof of whether the candidate dismissed a harmless OS battery popup or switched to ChatGPT/Google/notes.

##### B. Extended Screen Share, Virtual Display & Multi-Monitor Detection Engine
1. **Browser Display Topology Inspection:**
   * Queries `window.screen.isExtended` (supported across Chromium browsers) and requests `window.getScreenDetails()` permission during onboarding to enumerate all connected display surfaces (`ScreenDetailed[]`), logging display count, resolutions, and relative coordinates.
   * Registers `change` and `currentscreenchange` event listeners on the `ScreenDetails` interface to immediately detect if a candidate plugs in an HDMI monitor, activates Apple Sidecar/AirPlay, or connects a wireless display mid-interview.
2. **Mandatory Full-Monitor `getDisplayMedia` Verification:**
   * Enforces `{ video: { displaySurface: "monitor" }, selfBrowserSurface: "include", surfaceSwitching: "exclude" }`.
   * Inspects `track.getSettings().displaySurface` and compares `track.getSettings().width / height` against `window.screen.width * window.devicePixelRatio`. If the candidate attempts to share only a browser tab (`displaySurface === "browser"`) or application window (`displaySurface === "window"`), the session blocks progression until the full physical monitor is shared.
3. **Cross-Camera Physical Workspace Verification:**
   * Because sophisticated hardware splitters (HDMI mirroring/KVM switches) can sometimes mask extended displays from browser APIs, the **Secondary Smartphone Camera** (angled at `45°–60°` behind/beside the candidate) runs YOLOv8 object detection trained on `monitor`, `laptop`, `tv`, and `tablet` classes. If `> 1` active screen is visible in the physical workspace (excluding the candidate's primary screen and the paired smartphone itself), the system logs an `UNAUTHORIZED_SECONDARY_DISPLAY_VISIBLE` incident.

##### C. Constant Eye Movement, Reading Saccade & Gaze Oscillation Analyzer
To accurately detect candidates reading off-screen AI outputs (e.g., real-time interview copilot tools) or constantly darting their eyes to a hidden prompt without penalizing normal human thought processes:
1. **3D Iris & Head-Pose Coordinate Extraction (30 FPS):**
   * MediaPipe Face Landmarker extracts 3D facial landmarks alongside the 10 iris landmarks (`468–472` left eye, `473–477` right eye).
   * Computes a normalized **Eye-in-Head Gaze Ratio** $(\theta_{\text{horizontal}}, \theta_{\text{vertical}})$ combined with the **3D Head Pose Euler Angles** $(\text{Yaw}, \text{Pitch}, \text{Roll})$ to project an estimated **Point of Regard (PoR)** relative to the active interview screen.
2. **Three-Pattern Gaze Classifier (Sliding 15-Second Window):**
   * **Pattern 1 — Natural Cognitive Recall (Ignored / Benign):** Candidate shifts gaze upward or to the side (`1–2` shifts, duration `< 4.0s`) with low angular velocity while pausing or formulating a thought, then returns gaze to the virtual interviewer. **Action:** Classified as `BENIGN_COGNITIVE_GAZE`; zero alerts raised.
   * **Pattern 2 — Constant Eye Darting / High-Frequency Oscillation (`CONSTANT_EYE_MOVEMENT`):** Candidate's iris vector shifts rapidly between the camera/center screen and an off-axis coordinate (`>= 10` rapid saccadic jumps exceeding `15°` within a `15-second` window, or gaze dispersion variance $\sigma^2_{\text{gaze}} > \text{threshold}$). **Action:** Logs `OBSERVED_EVENT: HIGH_FREQUENCY_EYE_DARTING` and escalates to `INFERRED_SUSPICION` if repeated across multiple answers.
   * **Pattern 3 — Rhythmic Horizontal Reading Saccades (`READING_SACCADE_PATTERN`):** Detects the unmistakable biomechanical signature of reading text: slow progressive horizontal eye movement from left to right ($\Delta \theta_x > 0$ over `0.8–2.0s`) followed by a rapid backward "carriage-return" saccade ($\Delta \theta_x \ll 0$ in `< 150ms`) repeated across `>= 3` consecutive lines, especially when the screen-share shows no corresponding text at that screen region. **Action:** Escalates to `HIGH` `INFERRED_SUSPICION` (*"Rhythmic reading eye-movement pattern consistent with reading an external/overlay script"*).

##### D. Real-Time Lip-Sync & Audio-Visual Voice Correlation Engine
To prevent **proxy interviewing** (another person speaking off-camera while the candidate sits in front of the webcam, or pre-recorded/AI-synthesized voice injection via virtual audio cables):
1. **Edge Mouth Aspect Ratio (MAR) Kinematic Tracker:**
   * At `30 FPS`, the client worker computes the inner-lip **Mouth Aspect Ratio (MAR)** using upper/lower inner lip landmarks (`13, 14, 78, 308, 82, 87, 312, 317`):
     $$\text{MAR}(t) = \frac{\|P_{82} - P_{87}\| + \|P_{13} - P_{14}\| + \|P_{312} - P_{317}\|}{3 \cdot \|P_{78} - P_{308}\|}$$
   * Simultaneously computes the short-time audio root-mean-square energy $E_{\text{audio}}(t)$ and Silero VAD probability $P_{\text{VAD}}(t)$ on the microphone stream at `30 Hz` frame alignment.
2. **Server-Side Neural Audio-Visual Synchronization (SyncNet Discriminator):**
   * On the server proctoring worker, incoming RTP audio and video frames are aligned using RTCP Sender Report (SR) NTP timestamps (eliminating network transit jitter).
   * A lightweight **SyncNet** audio-visual correlation model processes `5-frame (0.2s)` sliding windows of cropped mouth regions (`96x96 px`) against `0.2s` Mel-spectrogram audio chunks, outputting an **Audio-Visual Cosine Similarity Score** $S_{\text{AV}} \in [0, 1]$ and estimated **Temporal Lag Offset** $\Delta t_{\text{AV}}$ (in milliseconds).
3. **Three-Mode Lip-Sync Anomaly Detection:**
   * **Mode 1 — Voice Active with Static/Closed Lips (`VOICE_WITHOUT_LIP_MOTION`):** Microphone captures active speech ($P_{\text{VAD}} > 0.75$ for `> 1.8 seconds`) while the candidate's mouth remains closed or static ($\text{MAR}_{\text{std}} < 0.012$ and $S_{\text{AV}} < 0.25$). Indicates an off-screen person answering or virtual audio injection.
   * **Mode 2 — Phoneme-Viseme Phase Mismatch (`LIP_SYNC_DESYNCHRONIZATION`):** Candidate moves their lips ("fake lip-syncing" / miming) while someone else speaks, resulting in low cross-correlation ($S_{\text{AV}} < 0.32$) or sustained phase lag ($|\Delta t_{\text{AV}}| > 300\text{ ms}$) over a `> 4.0 second` utterance, combined with voice embedding drift (`cosine_distance > 0.40` from onboarding calibration).
   * **Mode 3 — Silent Mouthing / Whisper Prompting (`SILENT_LIP_MOVEMENT`):** Candidate actively mouths words ($\text{MAR}$ oscillating $> 0.18$ at `2–5 Hz` for `> 2.5 seconds`) while $P_{\text{VAD}} < 0.15$ (e.g., silently mouthing the question to an off-screen helper or secondary voice device while muted).

---

### 4.6 Module E: Secondary Camera Integration Using a Smartphone

#### 4.6.1 Zero-Install Mobile Browser Pairing Architecture
Candidates do not install any native mobile app. The entire secondary camera flow runs inside standard mobile Safari (iOS) or Chrome (Android) over HTTPS/WebRTC:

```
Candidate Desktop Browser                   Backend / Signaling Server               Candidate Smartphone Browser
           │                                             │                                        │
           ├── 1. Request Secondary Pair Token ─────────►│                                        │
           │◄─ 2. Return Short-Lived JWT (TTL=5m) + URL ─┤                                        │
           │   (Renders Dynamic QR Code on Screen)       │                                        │
           │                                             │◄── 3. Candidate Scans QR & Opens URL ──┤
           │                                             ├─── 4. Validate Token & Bind Session ──►│
           │◄─ 5. Notify Desktop: "Phone Connected" ─────┤                                        │
           │                                             │◄── 6. Grant Cam Permission & Publish ──┤
           │                                             │       Rear/Wide WebRTC Video Track     │
           │◄─ 7. Subscribe to Secondary Preview ────────┼───► 8. Forward Stream to Proctor Engine│
```

#### 4.6.2 Security, Placement Guidance & Disconnection Handling
1. **Cryptographic Session Pairing:**
   * The QR code encodes `https://<domain>/companion?token=<ephemeral_jwt>`.
   * The token is single-use, bound to `interview_session_id`, expires in `300 seconds` if unscanned, and rotates automatically if refreshed. Once paired, the mobile browser receives a session-scoped WebRTC publish grant restricted strictly to the secondary video track (no audio capture on mobile to prevent acoustic feedback loops).
2. **Guided Workspace Placement UI:**
   * On the smartphone screen, an interactive visual overlay guides the candidate to prop the phone `1.0 to 1.5 meters` to their side/rear at a `45°–60°` angle so that **both the candidate's upper body/hands and the primary computer screen/desk surface** are visible.
   * Screen Wake Lock API (`navigator.wakeLock.request('screen')`) is activated automatically so the smartphone screen does not sleep during the interview.
3. **Real-Time Dual-Feed Synchronization & Disconnect Resilience:**
   * Both primary and secondary streams are synchronized via NTP/RTP timestamps on the SFU.
   * **Disconnect Detection:** Heartbeat pings run every `1,000ms`. If the smartphone stream drops (`ICE disconnected` or heartbeat timeout `> 2.5s`), the system:
     1. Logs a `SECONDARY_CAMERA_DISCONNECTED` event with the exact timestamp.
     2. Displays a non-blocking banner on the desktop UI (*"Secondary camera connection lost. Please check your phone connection or scan the QR code to reconnect"*).
     3. Depending on recruiter policy (`Mandatory` vs. `Recommended`), either pauses between questions for reconnection or continues the interview while marking the unmonitored interval on the proctoring timeline.

---

### 4.7 Module F: AI-Based Candidate Evaluation & Bias-Free Scoring Engine

#### 4.7.1 Post-Interview Multi-Pass Evaluation Pipeline
Immediately upon interview completion, an asynchronous workflow executes a **3-Stage Evaluation Pipeline**:

1. **Stage 1 — Transcript Consolidation & Alignment:**
   * Merges streaming STT segments with high-accuracy batch re-transcription (`Whisper-Large-v3` / `Deepgram Nova-2 Batch`) to ensure technical jargon (e.g., `idempotency`, `Kubernetes`, `PostgreSQL`, `OAuth2`) is spelled accurately.
   * Segments the transcript cleanly by Question ID (`Q1`, `Q1.a`, `Q2`, ...) with exact word-level start/end timestamps.
2. **Stage 2 — Question-by-Question Rubric Scoring (1 to 5 Scale):**
   * Evaluates each question response against the Job Description requirements, the Candidate's claimed resume experience, and the pre-generated `Expected_Answer_Rubric`.
   * Assigns a granular `1 to 5` score per question across four core dimensions:
     * **Technical Correctness:** Factual accuracy, architectural soundness, absence of hallucinations/misconceptions.
     * **Relevance & Completeness:** Directness in answering the prompt and coverage of edge cases.
     * **Depth of Demonstrated Understanding:** Ability to explain *why* and *how* based on real experience (including follow-up responses).
     * **Problem-Solving & Communication Clarity:** Logical structuring of thoughts and clarity of technical explanation.
   * **Standardized 1–5 Rubric Anchor Definitions:**
     * `5 (Exceptional)`: Complete, technically rigorous answer demonstrating deep production mastery, trade-off awareness, and concrete examples.
     * `4 (Strong)`: Accurate and complete answer covering core concepts well with minor omissions on edge cases.
     * `3 (Competent / Baseline)`: Understands fundamentals and answers the core prompt but lacks depth on follow-up probing.
     * `2 (Partial / Surface-Level)`: Mentions keywords but shows conceptual confusion or cannot substantiate resume claims.
     * `1 (Insufficient / Unanswered)`: Incorrect, irrelevant, or skipped/unanswered response.
3. **Stage 3 — Competency Synthesis & Evidence Grounding:**
   * Every score **must** include `verbatim_evidence_quotes` (exact substrings from the candidate's transcript with `[mm:ss]` timestamps) and an `evaluator_rationale` explaining *why* the score was awarded and *what* was missing.
   * Synthesizes overall **Key Strengths**, **Identified Knowledge Gaps**, and **Suggested Areas for Follow-Up Human Probing** (e.g., *"Candidate explained Spring Boot REST controllers well [04:12], but struggled to explain database transaction isolation levels under concurrent load [06:45]; probe concurrency in final round"*).

#### 4.7.2 Algorithmic Bias Insulation & Fairness Guardrails
In strict compliance with Section 3.F of the Problem Statement (*"The system should not rely solely on speaking speed, accent, facial expressions, or appearance to judge candidate quality"*):
* **Modality Isolation:** The Candidate Evaluation Engine receives **exclusively sanitized text transcripts, question prompts, job requirements, and resume data**. Zero video frames, facial emotion metrics, acoustic pitch/prosody features, speaking-rate metrics (WPM), or accent classifications are ever passed to the scoring LLM.
* **Non-Native Speaker & Disfluency Normalization:** Prompts explicitly instruct the evaluation engine to ignore conversational filler words (*"um", "uh"*), grammatical quirks typical of non-native speakers, or speech hesitations, focusing 100% on semantic and technical substance.

---

### 4.8 Module G: Interview Report & Recruiter Decision Dashboard

#### 4.8.1 Recruiter Dashboard Layout & Core Views
The Recruiter Dashboard is designed for rapid, evidence-backed review:

1. **Executive Overview Card:**
   * Candidate Name, Resume Link, Applied Job Role, Interview Date/Time, Total Duration, Completion Status (`Completed`, `Partial`, `Terminated`), and Question Completion Breakdown (e.g., `9 Completed, 1 Skipped, 0 Unanswered`).
   * **Overall Competency Radar & Weighted Score:** Visual breakdown across *Technical Knowledge*, *Problem-Solving*, *Role-Specific Competencies*, and *Communication Structure* (1.0–5.0 scale), paired with an AI Executive Summary and recommended next-step areas.
   * **Integrity & Anti-Cheat Scorecard Badge:** Displays a structured breakdown across all monitored channels:
     * **Browser & Display Integrity:** Tab Switches (`0`), Window Blurs (`1`), Extended Display Attempts (`0`), Fullscreen Exits (`0`).
     * **Visual & Eye-Movement Integrity:** Face Presence (`99.8%`), Multi-Person Flags (`0`), Constant Eye-Darting / Reading Saccade Flags (`0`).
     * **Audio & Lip-Sync Integrity:** Lip-Sync Coherence Score (`98.4% Match`), Secondary Voice Detections (`0`).
     * **Secondary Workspace Camera:** Connection Uptime (`100%`), Unauthorized Devices/Monitors (`0`).
2. **Synchronized Multi-Stream Playback & Proctoring Timeline:**
   * Synchronized HTML5/WebRTC media player displaying the **Primary Frontal Video**, **Secondary Workspace Video**, and **Full-Screen Desktop Capture** locked to a single master scrub bar.
   * **Interactive Multi-Track Timeline:** Color-coded markers along the video scrub bar showing:
     * **Blue Markers:** Question start/end boundaries (`Q1`–`Q10` and follow-ups).
     * **Purple Markers:** Browser / Display telemetry (`TAB_SWITCH`, `WINDOW_BLUR`, `EXTENDED_SCREEN_DETECTED`).
     * **Amber Markers:** Tier-1 `Observed Events` (e.g., brief camera disconnect, single gaze shift).
     * **Red Markers:** Tier-2 `Inferred Suspicions` (e.g., `READING_SACCADE_PATTERN` at `08:14`, `LIP_SYNC_MISMATCH` at `11:05`, or `MULTI_PERSON_DETECTED` at `14:22`).
   * Clicking any marker jumps all three video players directly to `timestamp - 2 seconds` and displays the captured forensic telemetry overlay (e.g., gaze trajectory vector, lip-sync MAR vs. audio waveform graph, or screen-share snapshot).
3. **Question-by-Question Deep-Dive Inspector:**
   * Expandable accordion for every question (`Q1`–`QN`):
     * Question text, category badge (`Technical`, `Scenario`, etc.), difficulty tag, and whether it was AI-generated or Recruiter-defined.
     * Full verbatim transcript of the candidate's answer (plus follow-up Q&A) with clickable timestamps.
     * Concise AI summary of the response.
     * Assigned `1–5` score, verbatim evidence quotes highlighted in the transcript, specific knowledge gaps identified, and any proctoring flags that occurred specifically during that question.
4. **Human-in-the-Loop Override & Governance Controls:**
   * **Score Override:** Recruiters can adjust any question's `1–5` score or overall competency rating, requiring a brief comment that is saved to an immutable `Recruiter_Override_Audit_Log`.
   * **Proctoring Event Disposition:** Recruiters can mark any proctoring event as `Verified Concern` or `Dismissed / False Alarm (Benign)`—updating the integrity badge in real time.
   * **Final Hiring Decision Selector:** Explicit recruiter decision control (`Advance to Next Round`, `Hold / Request Human Follow-Up`, `Reject`) confirming that a human reviewer owns the final hiring outcome.

---

## 5. Production Data Models & Database Schema

Below is the core relational schema (PostgreSQL) supporting full lifecycle traceability, including screen-share recordings, display audits, eye-movement metrics, and lip-sync telemetry:

```sql
-- 1. Job Configurations & Rubrics
CREATE TABLE interview_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruiter_id UUID NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    job_description TEXT NOT NULL,
    required_skills JSONB NOT NULL,          -- [{"skill": "Java", "priority": "MANDATORY"}, ...]
    experience_level VARCHAR(50) NOT NULL,   -- ENTRY, MID, SENIOR, STAFF
    duration_minutes INT NOT NULL DEFAULT 30,
    question_count INT NOT NULL DEFAULT 10,  -- Enforces default of 10 when unspecified
    category_weights JSONB NOT NULL,         -- {"technical": 40, "behavioral": 20, "experience": 20, "scenario": 20}
    difficulty_level VARCHAR(50) NOT NULL DEFAULT 'ADAPTIVE',
    max_follow_ups_per_question INT NOT NULL DEFAULT 1,
    response_time_limit_sec INT NOT NULL DEFAULT 180,
    secondary_cam_policy VARCHAR(30) NOT NULL DEFAULT 'RECOMMENDED',
    anti_cheat_policy JSONB NOT NULL DEFAULT '{
        "enforce_fullscreen": true,
        "require_full_monitor_share": true,
        "block_extended_displays": true,
        "enable_eye_saccade_tracking": true,
        "enable_lip_sync_verification": true
    }',
    rubric_schema JSONB NOT NULL,            -- 1-5 scale anchors and dimension weights
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Candidate Profiles & Parsed Resumes
CREATE TABLE candidate_resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_name VARCHAR(255) NOT NULL,
    candidate_email VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_format VARCHAR(10) NOT NULL,        -- PDF or DOCX
    extracted_skills JSONB NOT NULL,
    extracted_experience JSONB NOT NULL,
    extracted_education JSONB NOT NULL,
    extracted_projects JSONB NOT NULL,
    extracted_certifications JSONB NOT NULL,
    parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Interview Sessions, Display Audit & Consent Tracking
CREATE TABLE interview_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES interview_configs(id),
    resume_id UUID NOT NULL REFERENCES candidate_resumes(id),
    status VARCHAR(40) NOT NULL DEFAULT 'CREATED', -- CREATED, ONBOARDING, IN_PROGRESS, COMPLETED, INTERRUPTED
    primary_consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
    secondary_consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
    screen_share_consent_granted BOOLEAN NOT NULL DEFAULT FALSE,
    consent_metadata JSONB,                        -- IP, timestamp, user_agent
    display_topology_audit JSONB,                  -- {"is_extended": false, "screen_count": 1, "display_surface": "monitor"}
    lip_sync_calibration_profile JSONB,            -- Baseline MAR range, voice embedding vector, A/V hardware offset_ms
    secondary_cam_paired BOOLEAN NOT NULL DEFAULT FALSE,
    primary_recording_url TEXT,
    secondary_recording_url TEXT,
    screen_share_recording_url TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    recruiter_final_decision VARCHAR(40) DEFAULT 'PENDING_REVIEW',
    recruiter_notes TEXT
);

-- 4. Interview Questions & Responses (Supports Primary + Adaptive Follow-Ups)
CREATE TABLE interview_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id),
    parent_question_id UUID REFERENCES interview_questions(id), -- NULL for primary Qs; set for follow-ups
    sequence_index INT NOT NULL,
    is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
    source_type VARCHAR(20) NOT NULL,        -- AI_GENERATED or RECRUITER_DEFINED
    category VARCHAR(40) NOT NULL,           -- TECHNICAL, BEHAVIORAL, EXPERIENCE, SCENARIO
    difficulty VARCHAR(30) NOT NULL,
    target_skills JSONB NOT NULL,
    question_text TEXT NOT NULL,
    expected_answer_rubric JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, SKIPPED, UNANSWERED
    candidate_transcript TEXT,
    response_summary TEXT,
    audio_start_ms BIGINT,
    audio_end_ms BIGINT,
    ai_score NUMERIC(3,2),                   -- 1.00 to 5.00
    dimension_scores JSONB,                  -- {"technical_correctness": 4, "relevance": 5, ...}
    evidence_quotes JSONB,                   -- [{"quote": "...", "timestamp_ms": 124000}]
    ai_evaluation_rationale TEXT,
    recruiter_override_score NUMERIC(3,2),
    recruiter_override_reason TEXT
);

-- 5. Proctoring Telemetry & Incident Logs (Separates Observed Events vs. Inferred Suspicions)
CREATE TABLE proctoring_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id),
    question_id UUID REFERENCES interview_questions(id), -- Links incident to active question
    tier VARCHAR(30) NOT NULL,               -- OBSERVED_EVENT or INFERRED_SUSPICION
    camera_source VARCHAR(20) NOT NULL,      -- PRIMARY, SECONDARY, SCREEN_SHARE, AUDIO, BROWSER, AUDIO_VISUAL
    event_type VARCHAR(60) NOT NULL,         -- TAB_SWITCH, WINDOW_BLUR, EXTENDED_SCREEN_DETECTED, CONSTANT_EYE_MOVEMENT,
                                             -- READING_SACCADE_PATTERN, LIP_SYNC_MISMATCH, VOICE_WITHOUT_LIP_MOTION,
                                             -- FACE_ABSENT, MULTI_PERSON, EXTRA_VOICE, CAM_DISCONNECT, etc.
    severity VARCHAR(20) NOT NULL,           -- INFO, LOW, MEDIUM, HIGH
    timestamp_start_ms BIGINT NOT NULL,
    timestamp_end_ms BIGINT,
    description TEXT NOT NULL,
    benign_explanation_note TEXT,
    evidence_snapshot_url TEXT,
    evidence_clip_url TEXT,
    raw_telemetry JSONB,                     -- {"saccade_hz": 4.2, "av_sync_score": 0.19, "mar_std": 0.008, "is_extended": true}
    recruiter_disposition VARCHAR(30) DEFAULT 'UNREVIEWED' -- UNREVIEWED, VERIFIED_CONCERN, DISMISSED_FALSE_ALARM
);
```

---

## 6. Security, Privacy, Reliability & Compliance Architecture

Because this platform processes biometric video/audio streams, desktop screen shares, and personal career data, the final product implements strict enterprise safeguards:

1. **Explicit Multi-Stage Consent & Transparency:**
   * Candidates see real-time indicators whenever the primary camera, microphone, full-screen capture, or secondary smartphone camera is active. Recording never starts prior to explicit consent submission.
2. **Ephemeral Token Security for Secondary Camera:**
   * Smartphone pairing QR tokens are cryptographically signed (`HMAC-SHA256`), single-use, IP/session rate-limited, and scoped solely to publishing a single WebRTC video track into the active session room.
3. **Encryption in Transit & at Rest:**
   * All signaling and API traffic uses `TLS 1.3`. WebRTC media streams are encrypted via mandatory `DTLS-SRTP`.
   * Recorded video chunks, screen-share captures, snapshots, and resumes in S3 are encrypted at rest via `AES-256-GCM` (`SSE-KMS`) with short-lived pre-signed URLs (`TTL = 15 minutes`) generated exclusively for authenticated recruiters with RBAC access to that job requisition.
4. **Data Retention & GDPR/DPDP Compliance:**
   * Automated lifecycle policies purge raw video/audio/screen recordings after a configurable retention window (default `90 days`) while optionally retaining anonymized structured scorecards, or immediately executing full cascade deletion upon a candidate's Right-to-Erasure request.
5. **Anti-Tampering & Server-Authoritative Verification:**
   * While lightweight CV and browser hooks run on the client for instant UI feedback, the authoritative proctoring pipeline analyzes server-side RTP media streams (including SyncNet lip-sync verification, iris/gaze validation, and secondary-camera monitor detection) directly from the SFU—preventing candidates from bypassing proctoring via browser DevTools or tampered JavaScript.

---

## 7. Verification, Testing & Hackathon Evaluation Readiness

To guarantee top performance across all **8 Hackathon Evaluation Criteria** (Section 7 of the Problem Statement) as well as production deployment readiness, the system is validated against the following test suite and SLA targets:

### 7.1 Performance & Reliability SLAs
* **Question Generation Latency:** `< 6.0 seconds` from resume/JD upload to complete 10-question structured blueprint with rubrics.
* **Conversational Turn-Taking Latency (End-of-Speech to AI Voice Output):** `< 850 milliseconds` p95 (via streaming STT + low-latency LLM routing + streaming TTS).
* **Secondary Camera QR Pairing Time:** `< 3.0 seconds` from mobile QR scan to live dual-video rendering on desktop and proctoring worker.
* **Proctoring & Anti-Cheat Detection Latency:**
  * Tab switch / Window blur / Extended screen hot-plug: `< 250 milliseconds`.
  * Face absence / Multi-person / Camera disconnect: `< 1.0 second`.
  * Saccade / Constant eye movement & Lip-Sync mismatch correlation window: `< 2.0 seconds`.

### 7.2 Simulated Proctoring & False-Alarm Validation Matrix
During live demonstration and QA testing, the system must pass the following deterministic test scenarios:

| Test Scenario | Simulated Action | Expected System Behavior |
| :--- | :--- | :--- |
| **Scenario 1: Natural Thinking Gaze (False-Alarm Test)** | Candidate looks up and to the right for `2.5 seconds` while formulating a complex system design answer, then looks back at the screen. | **Zero Suspicion Raised.** Logged internally as normal cognitive gaze (`< 4.0s` threshold, no reading saccades); no false alarm triggered on recruiter timeline. |
| **Scenario 2: Constant Eye Movement & Reading Saccades (AI Copilot Test)** | Candidate continuously darts eyes or scans horizontally left-to-right with carriage-return snapbacks across `4 lines` immediately after a question is asked. | Iris tracker detects `READING_SACCADE_PATTERN` / `CONSTANT_EYE_MOVEMENT`, logs `OBSERVED_EVENT` markers, and escalates to a `HIGH` `INFERRED_SUSPICION` with synchronized primary + screen-share clip. |
| **Scenario 3: Tab Switch / Window Blur** | Candidate presses `Alt+Tab` or clicks another browser tab for `4 seconds` during Question 3. | `visibilitychange` / `blur` listener fires within `< 200ms`, logs `TAB_SWITCH` (`HIGH`), captures exact desktop screen-share frame showing the external tab/app, and warns candidate to return to fullscreen. |
| **Scenario 4: Extended Screen Share / Dual Monitor Attempt** | Candidate connects a second monitor via HDMI or attempts to share only a single browser tab instead of the entire monitor. | `window.screen.isExtended` + `displaySurface` check blocks onboarding (or pauses live interview on hot-plug) and logs `EXTENDED_SCREEN_DETECTED`. Secondary phone camera also flags extra physical monitor on desk. |
| **Scenario 5: Lip-Sync Mismatch / Proxy Voice Dubbing** | Candidate stays silent or mimes vaguely while an off-screen person (or virtual audio feed) speaks the technical answer into the microphone. | Edge MAR tracker + Server SyncNet detect active speech (`VAD = True`) with low lip-sync correlation (`S_AV < 0.25` / static `MAR`), flagging `LIP_SYNC_MISMATCH` (`HIGH`) with side-by-side audio waveform vs. lip-motion evidence. |
| **Scenario 6: Secondary Person Entering Workspace** | A second person enters the room out of view of the primary webcam, but visible in the **Secondary Smartphone Camera** angled at the workspace. | Secondary camera YOLOv8 detector triggers `MULTI_PERSON_DETECTED` within `1.5s`, captures dual-frame snapshot, and logs timestamped incident. |
| **Scenario 7: Secondary Smartphone Disconnect** | Candidate closes mobile browser tab mid-interview. | System logs `SECONDARY_CAMERA_DISCONNECTED` within `2.0s`, alerts candidate UI with reconnect QR code, and marks the unmonitored window on the dashboard timeline. |
| **Scenario 8: Default-10 Question & Follow-Up Cap** | Recruiter leaves question count blank and sets max 1 follow-up per question. Candidate gives a vague answer on Q1. | System generates exactly `10` primary questions, asks `Q1.a` to probe the vague answer, and completes `Q1`–`Q10` without exceeding the 10-primary-question structure. |

---

## 8. Phased Implementation & Delivery Roadmap

To build and ship this complete production system cleanly, engineering execution is structured into four modular sprints:

1. **Phase 1 — Core Foundation, Ingestion & Question Blueprint Engine:**
   * Set up PostgreSQL (`pgvector`), Redis, FastAPI backend, and Next.js frontend.
   * Implement PDF/DOCX resume parser, JD skill extractor, semantic deduplication gate, custom recruiter question merging, and the default-10 question generator.
2. **Phase 2 — WebRTC Autonomous Video Interviewer, Display Lockdown & Onboarding Wizard:**
   * Integrate LiveKit SFU (Primary Cam + Mic + Full-Monitor Screen Share), hardware/microphone loopback diagnostics, Lip-Sync baseline calibration, `isExtended` multi-monitor gate, informed consent logging, streaming STT (Deepgram), streaming TTS (Cartesia/ElevenLabs), and the Interview FSM with silence recovery and bounded adaptive follow-ups.
3. **Phase 3 — Dual-Camera QR Pairing & Multi-Modal Anti-Cheat Forensics Engine:**
   * Build the mobile web companion page with ephemeral JWT QR pairing and workspace placement overlay.
   * Deploy client MediaPipe (Face + 3D Iris Saccade + Lip MAR) + browser Tab/Focus/Display guards + server YOLOv8/PyAnnote/SyncNet workers for tab switches, extended screen detection, constant eye movement, lip-sync verification, multi-person detection, and the Two-Tier `Observed_Event` vs. `Inferred_Suspicion` incident logger.
4. **Phase 4 — Bias-Insulated Evaluation Engine & Recruiter Multi-Stream Dashboard:**
   * Implement the multi-pass 1–5 rubric evaluator with mandatory verbatim transcript citations and modality isolation.
   * Build the Recruiter Dashboard featuring synchronized 3-stream playback (Primary Cam + Secondary Cam + Screen Share), interactive forensic timeline scrubbing, score override audit trails, and one-click report export.
