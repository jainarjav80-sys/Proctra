# Technical Requirements & Architecture Specification Document (TRD)
## Enterprise AI-Powered Video Interview Agent with Dual-Camera & Multi-Modal Anti-Cheat Forensics

**Document Version:** 1.1 (Production Engineering Specification — Synced with `PDR.md` v1.1)  
**Target Environment:** Cloud-Native Distributed Microservices, WebRTC SFU Media Mesh, Edge WebAssembly/WebGPU Workers, and GPU Inference Cluster  
**Compliance Coverage:** 100% Traceability to Problem Statement (`PS.txt`) + Enhanced Anti-Cheat Suite (Tab Change, Extended Screen Share, Constant Eye Movement/Saccades, and Real-Time Lip-Sync Verification)

---

## 1. System Engineering Overview & Non-Functional SLAs

This Technical Requirements Document (`TRD.md`) translates the functional specifications in `PDR.md` into concrete, implementation-ready engineering blueprints, API contracts, real-time streaming protocols, mathematical detection algorithms, database schemas, and state machines.

### 1.1 Hard Production Latency & Throughput Budgets

| Subsystem / Pipeline Stage | Target p50 | Target p95 | Hard Timeout / Fallback |
| :--- | :--- | :--- | :--- |
| **Resume & JD Parsing + Entity Extraction** | `1.8s` | `3.5s` | `8.0s` (Fallback to native regex/layout chunker) |
| **10-Question Blueprint + Rubric Generation** | `2.4s` | `4.8s` | `10.0s` (Parallelized category generation) |
| **Streaming STT Endpointing Latency** | `180ms` | `310ms` | `600ms` (Local Silero VAD trigger fallback) |
| **Conversational Turn Routing (Follow-Up vs. Next Q)** | `240ms` | `420ms` | `900ms` (Deterministic advance to next primary Q) |
| **Streaming TTS Time-to-First-Byte (TTFB)** | `140ms` | `230ms` | `500ms` (Browser Web Speech API fallback) |
| **Total Voice-to-Voice Turn Latency** | `560ms` | `850ms` | `1,500ms` max ceiling |
| **Tab Switch / Window Blur / Extended Display Telemetry** | `40ms` | `120ms` | `< 250ms` WebSocket high-priority control frame |
| **Edge CV (Face + 478 Landmarks + Iris + Lip MAR)** | `14ms/frame` | `28ms/frame` | Sustained `30 FPS` in dedicated Web Worker |
| **Server SyncNet Lip-Sync & YOLOv8 Verification** | `190ms` | `380ms` | `1,000ms` sliding window evaluation |
| **Secondary Smartphone QR Handshake to Live Video** | `1.2s` | `2.4s` | `5.0s` (TURN/TLS 443 relay fallback) |
| **Post-Interview Full Rubric Evaluation & Report** | `6.5s` | `12.0s` | `25.0s` async worker completion |

---

## 2. Repository Structure & Microservices Topology

The production codebase is organized as a polyglot monorepo (`Turborepo` + `uv`/`Poetry` workspaces) to maintain strict type parity between TypeScript clients and Python AI/Media services:

```
ai-video-interviewer/
├── apps/
│   ├── web-portal/                  # Next.js 14 (App Router) — Recruiter Dashboard, Config UI, Candidate Desktop UI
│   ├── mobile-companion/            # Lightweight Next.js/PWA route — Zero-install Smartphone Secondary Camera UI
│   ├── api-gateway/                 # FastAPI — REST/GraphQL API, Auth, RBAC, Session & Token Management
│   ├── agent-orchestrator/          # Python LiveKit Agent Worker — Full-duplex Interview FSM, STT, LLM, TTS
│   ├── proctor-forensics-worker/    # Python GPU Worker — YOLOv8x, SyncNet Lip-Sync, PyAnnote Diarization, Aggregator
│   └── evaluation-worker/           # Celery/Temporal Worker — Batch STT alignment, 1-5 Rubric Judge, Clip Muxer
├── packages/
│   ├── edge-proctor-sdk/            # TypeScript + WebWorker — MediaPipe Face/Iris/MAR, Tab/Focus/Display Guards
│   ├── shared-schemas/              # Pydantic + Zod shared contracts (OpenAPI auto-generated types)
│   └── database/                    # SQLAlchemy 2.0 async models, Alembic migrations, pgvector queries
└── infra/
    ├── docker-compose.prod.yml      # LiveKit SFU, coturn, Postgres 16 (pgvector), Redis 7, MinIO/S3
    └── k8s/                         # Helm charts, GPU node autoscalers, Ingress TLS configs
```

---

## 3. Data Layer & Complete Production Database Schema

### 3.1 PostgreSQL 16 + `pgvector` Relational & Vector Schema

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 1. ENUM Types for Deterministic State Management
CREATE TYPE experience_level_enum AS ENUM ('INTERN', 'ENTRY', 'MID', 'SENIOR', 'STAFF');
CREATE TYPE difficulty_level_enum AS ENUM ('FOUNDATIONAL', 'INTERMEDIATE', 'ADVANCED', 'ADAPTIVE');
CREATE TYPE secondary_cam_policy_enum AS ENUM ('MANDATORY', 'RECOMMENDED', 'DISABLED');
CREATE TYPE session_status_enum AS ENUM ('CREATED', 'ONBOARDING', 'IN_PROGRESS', 'PAUSED_RECONNECT', 'COMPLETED', 'TERMINATED');
CREATE TYPE question_category_enum AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'EXPERIENCE', 'SCENARIO');
CREATE TYPE question_source_enum AS ENUM ('AI_GENERATED', 'RECRUITER_DEFINED');
CREATE TYPE question_status_enum AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'UNANSWERED');
CREATE TYPE proctor_tier_enum AS ENUM ('OBSERVED_EVENT', 'INFERRED_SUSPICION');
CREATE TYPE proctor_source_enum AS ENUM ('PRIMARY_CAM', 'SECONDARY_CAM', 'SCREEN_SHARE', 'AUDIO', 'BROWSER_ENV', 'AUDIO_VISUAL_SYNC');
CREATE TYPE proctor_severity_enum AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE disposition_status_enum AS ENUM ('UNREVIEWED', 'VERIFIED_CONCERN', 'DISMISSED_FALSE_ALARM');

-- 2. Interview Configuration & Anti-Cheat Policy Table
CREATE TABLE interview_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recruiter_id UUID NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    job_description TEXT NOT NULL,
    required_skills JSONB NOT NULL,               -- [{"name": "Spring Boot", "mandatory": true, "weight": 1.5}]
    experience_level experience_level_enum NOT NULL DEFAULT 'MID',
    duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 10 AND 90),
    question_count INT NOT NULL DEFAULT 10 CHECK (question_count BETWEEN 3 AND 25), -- Enforces Default = 10
    category_distribution JSONB NOT NULL DEFAULT '{"TECHNICAL": 40, "BEHAVIORAL": 20, "EXPERIENCE": 20, "SCENARIO": 20}',
    difficulty_level difficulty_level_enum NOT NULL DEFAULT 'ADAPTIVE',
    max_follow_ups_per_question INT NOT NULL DEFAULT 1 CHECK (max_follow_ups_per_question BETWEEN 0 AND 3),
    response_time_limit_sec INT NOT NULL DEFAULT 180,
    secondary_cam_policy secondary_cam_policy_enum NOT NULL DEFAULT 'RECOMMENDED',
    anti_cheat_config JSONB NOT NULL DEFAULT '{
        "enforce_fullscreen": true,
        "require_full_monitor_screen_share": true,
        "block_extended_displays": true,
        "max_tab_switches_before_high_flag": 2,
        "gaze_offscreen_grace_ms": 4000,
        "saccade_reading_sweep_threshold": 3,
        "eye_darting_shifts_per_15s_threshold": 10,
        "lip_sync_min_correlation_score": 0.32,
        "lip_sync_max_offset_ms": 300,
        "voice_without_lips_min_duration_ms": 1800
    }',
    rubric_config JSONB NOT NULL,                 -- Custom 1-5 anchor definitions and dimension weights
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Candidate Resumes & Extracted Knowledge Graph
CREATE TABLE candidate_resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_name VARCHAR(255) NOT NULL,
    candidate_email VARCHAR(255) NOT NULL,
    raw_file_s3_uri TEXT NOT NULL,
    file_mime_type VARCHAR(100) NOT NULL,         -- application/pdf or application/vnd.openxmlformats...
    parsed_raw_text TEXT NOT NULL,
    extracted_skills JSONB NOT NULL,              -- [{"skill": "Java", "years": 3, "evidence": "Built payment service"}]
    extracted_experience JSONB NOT NULL,          -- [{"company": "...", "role": "...", "highlights": [...]}]
    extracted_projects JSONB NOT NULL,
    extracted_education JSONB NOT NULL,
    extracted_certifications JSONB NOT NULL,
    resume_embedding vector(1536),                -- OpenAI text-embedding-3-small vector for semantic matching
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Interview Sessions, Hardware/Display Calibration & Recordings
CREATE TABLE interview_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL REFERENCES interview_configs(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES candidate_resumes(id) ON DELETE RESTRICT,
    livekit_room_name VARCHAR(128) UNIQUE NOT NULL,
    status session_status_enum NOT NULL DEFAULT 'CREATED',
    
    -- Explicit Consent & Onboarding Audit
    primary_av_consent BOOLEAN NOT NULL DEFAULT FALSE,
    secondary_cam_consent BOOLEAN NOT NULL DEFAULT FALSE,
    screen_share_consent BOOLEAN NOT NULL DEFAULT FALSE,
    ai_proctoring_consent BOOLEAN NOT NULL DEFAULT FALSE,
    consent_audit_log JSONB,                      -- {"ip": "...", "ua": "...", "signed_at": "...", "hash": "..."}
    
    -- Display Topology & Biometric Baseline Calibration
    display_topology_state JSONB,                 -- {"is_extended": false, "screen_count": 1, "surface": "monitor", "res": "1920x1080"}
    voice_biometric_embedding vector(256),        -- Resemblyzer/ECAPA-TDNN 256-d speaker embedding from onboarding
    lip_sync_baseline JSONB,                      -- {"mar_rest": 0.02, "mar_speech_mean": 0.24, "av_hw_offset_ms": 45}
    
    -- Secondary Smartphone Pairing State
    secondary_cam_paired BOOLEAN NOT NULL DEFAULT FALSE,
    secondary_cam_device_info JSONB,              -- {"os": "iOS 17.4", "browser": "Safari", "paired_at": "..."}
    
    -- Synchronized Media Egress URIs (Encrypted S3)
    primary_video_s3_uri TEXT,
    secondary_video_s3_uri TEXT,
    screen_share_video_s3_uri TEXT,
    mixed_audio_s3_uri TEXT,
    
    -- Timing & Recruiter Governance
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    active_elapsed_seconds INT NOT NULL DEFAULT 0,
    overall_ai_score NUMERIC(3,2),
    competency_breakdown JSONB,                   -- {"technical": 4.2, "problem_solving": 3.8, "communication": 4.5, "role_fit": 4.0}
    executive_summary TEXT,
    strengths_identified JSONB,
    knowledge_gaps_identified JSONB,
    recommended_followup_areas JSONB,
    recruiter_final_decision VARCHAR(50) DEFAULT 'PENDING_REVIEW',
    recruiter_decision_notes TEXT,
    recruiter_reviewed_by UUID,
    recruiter_reviewed_at TIMESTAMPTZ
);

-- 5. Interview Questions, Adaptive Follow-Ups & Evidence-Grounded Evaluations
CREATE TABLE interview_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    parent_question_id UUID REFERENCES interview_questions(id) ON DELETE CASCADE, -- NULL for Primary Q1..QN
    primary_index INT NOT NULL,                   -- 1..10 (or configured N)
    follow_up_index INT NOT NULL DEFAULT 0,       -- 0 for primary, 1 for Qi.a, 2 for Qi.b
    source question_source_enum NOT NULL DEFAULT 'AI_GENERATED',
    category question_category_enum NOT NULL,
    difficulty difficulty_level_enum NOT NULL,
    target_skills JSONB NOT NULL,
    question_text TEXT NOT NULL,
    question_embedding vector(1536),              -- Used to enforce < 0.82 cosine similarity deduplication
    expected_answer_rubric JSONB NOT NULL,        -- {"must_mention": [...], "follow_up_triggers": [...], "red_flags": [...]}
    
    -- Execution & State Tracking
    status question_status_enum NOT NULL DEFAULT 'PENDING',
    asked_at_ms BIGINT,                           -- Relative to session started_at
    answered_at_ms BIGINT,
    duration_sec INT,
    candidate_transcript TEXT,
    word_timestamps JSONB,                        -- [{"word": "microservices", "start_ms": 12400, "end_ms": 12950, "conf": 0.99}]
    ai_response_summary TEXT,
    
    -- Rubric Evaluation & Recruiter Override
    ai_score NUMERIC(3,2) CHECK (ai_score BETWEEN 1.00 AND 5.00),
    dimension_scores JSONB,                       -- {"correctness": 4, "relevance": 5, "completeness": 4, "understanding": 4}
    verbatim_evidence_quotes JSONB,               -- [{"quote": "...", "start_ms": 14000, "end_ms": 19500}]
    ai_evaluation_rationale TEXT,
    recruiter_override_score NUMERIC(3,2) CHECK (recruiter_override_score BETWEEN 1.00 AND 5.00),
    recruiter_override_reason TEXT,
    recruiter_overridden_at TIMESTAMPTZ
);

-- 6. Proctoring Telemetry & Incident Logs (Two-Tier Observed vs. Inferred)
CREATE TABLE proctoring_incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_id UUID REFERENCES interview_questions(id) ON DELETE SET NULL,
    tier proctor_tier_enum NOT NULL,              -- OBSERVED_EVENT vs INFERRED_SUSPICION
    source proctor_source_enum NOT NULL,
    event_type VARCHAR(64) NOT NULL,              -- See Section 5.1 Canonical Event Taxonomy
    severity proctor_severity_enum NOT NULL,
    confidence_score NUMERIC(4,3) NOT NULL CHECK (confidence_score BETWEEN 0.000 AND 1.000),
    timestamp_start_ms BIGINT NOT NULL,
    timestamp_end_ms BIGINT,
    duration_ms INT,
    description TEXT NOT NULL,
    benign_explanation TEXT,                      -- Mandatory for INFERRED_SUSPICION to prevent human bias
    telemetry_payload JSONB NOT NULL,             -- Raw vectors: yaw/pitch, saccade_hz, mar_std, syncnet_score, screen_surface
    primary_snapshot_s3_uri TEXT,
    secondary_snapshot_s3_uri TEXT,
    screen_snapshot_s3_uri TEXT,
    evidence_video_clip_s3_uri TEXT,
    disposition disposition_status_enum NOT NULL DEFAULT 'UNREVIEWED',
    disposition_notes TEXT,
    disposition_updated_by UUID,
    disposition_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_session_seq ON interview_questions(session_id, primary_index, follow_up_index);
CREATE INDEX idx_proctoring_session_time ON proctoring_incidents(session_id, timestamp_start_ms);
CREATE INDEX idx_proctoring_tier_type ON proctoring_incidents(session_id, tier, event_type);
```

### 3.2 Redis Real-Time State & Ephemeral Token Structures

* `session:{session_id}:fsm` (Hash): Stores current `state` (`INTRO`, `ASKING_Q`, `LISTENING`, `EVALUATING_TURN`, `PAUSED`), `current_primary_index`, `current_followup_index`, `remaining_time_sec`, and `last_heartbeat_ts`.
* `session:{session_id}:qr_token:{nonce}` (String with `EX 300`): Stores single-use JSON payload `{"session_id": "...", "issued_at": ..., "used": false}` for smartphone secondary camera pairing.
* `session:{session_id}:telemetry_window` (Redis TimeSeries / Sorted Set, 60s rolling TTL): Buffers high-frequency 10Hz client telemetry frames (`gaze_x`, `gaze_y`, `head_yaw`, `mar`, `vad_prob`, `tab_focused`, `is_extended`) for sliding-window anomaly correlation.

---

## 4. Core Service Specifications & Algorithms (Modules A, B, C, E, F, G)

### 4.1 Module A & B: Resume Ingestion & Question Generation Pipeline

#### 4.1.1 Document Parsing & Entity Extraction (`apps/api-gateway/services/ingestion.py`)
1. **File Validation:** Validates magic bytes (`%PDF-` for PDF; `PK\x03\x04` for DOCX) and enforces `max_size <= 15 MB`.
2. **Text & Layout Extraction:**
   * PDFs: Extracted via `pdfplumber` with layout bounding-box sorting to handle two-column resumes without interleaving lines. If total extracted text `< 100` characters, converts pages via `pdf2image` (`200 DPI`) and runs `RapidOCR`/`Tesseract`.
   * DOCX: Extracted via `python-docx`, iterating over both `doc.paragraphs` and `doc.tables` (since many candidates format skills inside tables).
3. **Structured Extraction Call:** Executes a single structured LLM extraction call (`response_format=ResumeExtractionSchema`) extracting normalized skills, calculated tenure per role, project architectures, education, and certifications.

#### 4.1.2 Default-10 Rule & Semantic Deduplication Algorithm (`apps/api-gateway/services/question_generator.py`)
```python
def resolve_question_blueprint(config: InterviewConfig, resume: CandidateResume) -> list[QuestionDraft]:
    # 1. Enforce Default-10 Rule
    target_count: int = config.question_count if config.question_count is not None else 10
    
    # 2. Lock Recruiter-Defined Custom Questions First
    locked_questions: list[QuestionDraft] = load_recruiter_questions(config.id)[:target_count]
    remaining_slots: int = target_count - len(locked_questions)
    
    if remaining_slots == 0:
        return locked_questions

    # 3. Compute JD-to-Resume Skill Alignment Matrix
    # Buckets: VERIFY_DEPTH (in both), ASSESS_ADAPTABILITY (adjacent), BASELINE_GAP (in JD only)
    alignment_matrix = compute_skill_alignment(config.required_skills, resume.extracted_skills)

    # 4. Generate Candidate Questions with Expected Answer Rubrics
    generated = llm_generate_questions(
        jd=config.job_description,
        alignment=alignment_matrix,
        projects=resume.extracted_projects,
        experience_level=config.experience_level,
        difficulty=config.difficulty_level,
        category_distribution=config.category_distribution,
        count=remaining_slots
    )

    # 5. Cosine-Similarity Deduplication Gate (< 0.82 threshold)
    accepted: list[QuestionDraft] = list(locked_questions)
    accepted_embeddings = embed_texts([q.question_text for q in accepted])

    for candidate_q in generated:
        emb = embed_text(candidate_q.question_text)
        while any(cosine_similarity(emb, existing) >= 0.82 for existing in accepted_embeddings):
            candidate_q = llm_regenerate_single_question(candidate_q.category, accepted)
            emb = embed_text(candidate_q.question_text)
        accepted.append(candidate_q)
        accepted_embeddings.append(emb)

    return accepted
```

---

### 4.2 Module C: Autonomous AI Video Interviewer & Turn-Taking Engine

#### 4.2.1 LiveKit Multi-Track Room Topology
Each active interview session maps to an isolated LiveKit room (`room_name = f"interview_{session_id}"`) with three participants and five media/data tracks:
1. **`participant_candidate_desktop`:**
   * `track_primary_video`: `1280x720 @ 30fps` (VP8/H.264), frontal webcam.
   * `track_primary_audio`: `48kHz mono` (Opus), candidate microphone.
   * `track_screen_share`: `1920x1080 @ 5–15fps` (VP8), mandatory full-monitor capture (`displaySurface === "monitor"`).
   * `data_channel_telemetry`: Reliable ordered WebRTC DataChannel streaming `10Hz` edge proctoring packets and instant browser/tab events.
2. **`participant_candidate_mobile`:**
   * `track_secondary_video`: `1280x720 @ 15–24fps`, rear/wide smartphone camera angled at workspace. (Audio disabled to prevent echo).
3. **`participant_ai_interviewer` (Server Worker):**
   * Subscribes to `track_primary_audio` for streaming STT and VAD.
   * Publishes `track_agent_audio` (`24kHz` Opus TTS stream) + synchronized viseme timestamps over DataChannel to animate the virtual interviewer avatar on the candidate's screen.

#### 4.2.2Bounded Adaptive Follow-Up & Turn-Decision Logic
When the candidate finishes speaking (triggered by Silero VAD silence `>= 2.4s` + semantic end-of-thought detector, or clicking *"Done Answering"*), the orchestrator runs a fast routing check (`< 350ms`):

```python
async def evaluate_turn_transition(
    session: SessionState,
    current_q: InterviewQuestion,
    transcript: str
) -> TurnAction:
    # 1. Check if candidate explicitly asked to repeat or skip
    intent = classify_meta_intent(transcript)
    if intent == "REPEAT_QUESTION":
        return TurnAction(type="REPEAT_CURRENT")
    if intent == "SKIP_QUESTION":
        await mark_question_status(current_q.id, "SKIPPED")
        return TurnAction(type="ADVANCE_NEXT_PRIMARY")

    # 2. Check Hard Follow-Up & Time Budget Guardrails
    remaining_primary_qs = session.total_primary_questions - current_q.primary_index
    reserved_time_for_remaining = remaining_primary_qs * session.avg_seconds_per_primary_q
    unallocated_buffer_sec = session.remaining_interview_seconds - reserved_time_for_remaining

    can_ask_followup = (
        current_q.follow_up_index < session.config.max_follow_ups_per_question
        and unallocated_buffer_sec > 90
    )

    if not can_ask_followup:
        await mark_question_status(current_q.id, "COMPLETED")
        return TurnAction(type="ADVANCE_NEXT_PRIMARY")

    # 3. Fast LLM Probe Check: Did the answer miss a key rubric anchor or make a vague claim?
    probe_decision = await fast_llm_check_followup(
        question=current_q.question_text,
        rubric=current_q.expected_answer_rubric,
        candidate_answer=transcript,
        prior_context=session.rolling_context_summary
    )

    if probe_decision.requires_followup:
        await mark_question_status(current_q.id, "COMPLETED")
        followup_q = await create_followup_question(
            parent_q=current_q,
            question_text=probe_decision.followup_question_text,
            follow_up_index=current_q.follow_up_index + 1
        )
        return TurnAction(type="ASK_FOLLOWUP", next_question=followup_q)

    await mark_question_status(current_q.id, "COMPLETED")
    return TurnAction(type="ADVANCE_NEXT_PRIMARY")
```

---

## 5. Deep-Dive Engineering: Intelligent Anti-Cheating & Forensics Engine (Module D + Enhanced Checks)

### 5.1 Canonical Event Taxonomy (`Observed_Event` vs. `Inferred_Suspicion`)

To satisfy the strict requirement that the system distinguish between an **observed event** and an **inferred suspicion**, every detector emits Tier-1 `OBSERVED_EVENT` records into the sliding-window correlator, which only emits Tier-2 `INFERRED_SUSPICION` alerts when deterministic multi-signal or temporal rules are met:

| Event Code | Tier | Source | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `OBS_TAB_HIDDEN` | `OBSERVED_EVENT` | `BROWSER_ENV` | `document.visibilityState === 'hidden'` for `>= 100ms`. |
| `OBS_WINDOW_BLUR` | `OBSERVED_EVENT` | `BROWSER_ENV` | `window.onblur` or `!document.hasFocus()` for `>= 500ms`. |
| `OBS_FULLSCREEN_EXIT` | `OBSERVED_EVENT` | `BROWSER_ENV` | `document.fullscreenElement === null` during active interview. |
| `OBS_RESTRICTED_HOTKEY_OR_PASTE` | `OBSERVED_EVENT` | `BROWSER_ENV` | Intercepted `Alt+Tab`, `Cmd+Tab`, `F12`, `PrintScreen`, or `paste` event. |
| `INF_UNAUTHORIZED_EXTERNAL_LOOKUP` | `INFERRED_SUSPICION` | `BROWSER_ENV` | `OBS_TAB_HIDDEN` (`> 3.0s`) OR `>= 2` focus losses during a question, paired with screen-share evidence clip. |
| `OBS_EXTENDED_DISPLAY_DETECTED` | `OBSERVED_EVENT` | `BROWSER_ENV` | `window.screen.isExtended === true` or `getScreenDetails().screens.length > 1`. |
| `OBS_INVALID_SCREEN_SHARE_SURFACE` | `OBSERVED_EVENT` | `SCREEN_SHARE` | `track.getSettings().displaySurface !== 'monitor'` or screen share stopped. |
| `OBS_PHYSICAL_SECOND_MONITOR` | `OBSERVED_EVENT` | `SECONDARY_CAM` | YOLOv8 detects `> 1` monitor/laptop screen in workspace view. |
| `INF_MULTI_SCREEN_ASSISTANCE` | `INFERRED_SUSPICION` | `SCREEN_SHARE` | Any extended display active mid-interview OR secondary cam monitor correlated with off-axis gaze. |
| `OBS_GAZE_OFF_CENTER` | `OBSERVED_EVENT` | `PRIMARY_CAM` | 3D Gaze vector exceeds `±30°` Yaw or `±25°` Pitch for `> 4.0s` (ignores `< 4.0s` thinking glances). |
| `OBS_HIGH_FREQ_EYE_DARTING` | `OBSERVED_EVENT` | `PRIMARY_CAM` | `>= 10` rapid saccadic gaze shifts (`> 15°` amplitude) within a `15s` sliding window. |
| `OBS_HORIZONTAL_READING_SACCADE` | `OBSERVED_EVENT` | `PRIMARY_CAM` | `>= 3` consecutive slow left-to-right iris sweeps (`0.8–2.5s`) with rapid `< 150ms` carriage-return snapbacks. |
| `INF_OFFSCREEN_SCRIPT_OR_COPILOT_READING` | `INFERRED_SUSPICION` | `PRIMARY_CAM` | `OBS_HORIZONTAL_READING_SACCADE` or sustained `OBS_HIGH_FREQ_EYE_DARTING` occurring during speech or right after question prompt. |
| `OBS_VOICE_WITHOUT_LIP_MOTION` | `OBSERVED_EVENT` | `AUDIO_VISUAL_SYNC` | `VAD_prob > 0.75` for `> 1.8s` while `MAR_std < 0.012` (lips closed/static). |
| `OBS_LIP_MOTION_WITHOUT_VOICE` | `OBSERVED_EVENT` | `AUDIO_VISUAL_SYNC` | `MAR` oscillates `> 0.18` at `2–5 Hz` for `> 2.5s` while `VAD_prob < 0.15` (silent mouthing). |
| `OBS_AV_SYNC_PHASE_MISMATCH` | `OBSERVED_EVENT` | `AUDIO_VISUAL_SYNC` | Server SyncNet confidence `< 0.32` or A/V lag `> 300ms` over `> 4.0s` speech segment. |
| `INF_PROXY_SPEAKER_OR_AUDIO_INJECTION` | `INFERRED_SUSPICION` | `AUDIO_VISUAL_SYNC` | `OBS_VOICE_WITHOUT_LIP_MOTION` or `OBS_AV_SYNC_PHASE_MISMATCH` correlated with speaker embedding drift (`> 0.40`). |
| `OBS_FACE_ABSENT` | `OBSERVED_EVENT` | `PRIMARY_CAM` | `0 faces` detected for `> 3.0s`. Escalates to `INF_CANDIDATE_LEFT_STATION` if `> 10.0s`. |
| `OBS_MULTIPLE_PERSONS` | `OBSERVED_EVENT` | `PRIMARY/SECONDARY` | `>= 2` persons detected for `> 1.5s`. Escalates to `INF_UNAUTHORIZED_PERSON_IN_ROOM` if `> 4.0s`. |

---

### 5.2 Implementation Blueprint 1: Tab Change, Focus Lockdown & Extended Screen Share Guard (`packages/edge-proctor-sdk/src/displayGuard.ts`)

```typescript
export interface DisplayAndFocusTelemetry {
  timestamp_ms: number;
  visibility_state: DocumentVisibilityState;
  window_focused: boolean;
  is_fullscreen: boolean;
  is_extended_display: boolean;
  detected_screen_count: number;
  screen_share_surface: string | null; // Must be "monitor"
  screen_share_active: boolean;
}

export class BrowserIntegrityGuard {
  private screenStream: MediaStream | null = null;
  private screenDetails: any = null;

  public async initializeAndEnforceLockdown(
    onViolation: (eventCode: string, payload: Record<string, any>) => void
  ): Promise<boolean> {
    // 1. Check Extended Display via Screen API & Window Management API
    const isExtended = (window.screen as any).isExtended === true;
    let screenCount = 1;

    if ('getScreenDetails' in window) {
      try {
        this.screenDetails = await (window as any).getScreenDetails();
        screenCount = this.screenDetails.screens.length;
        this.screenDetails.addEventListener('screenschange', () => {
          const count = this.screenDetails.screens.length;
          if (count > 1 || (window.screen as any).isExtended) {
            onViolation('OBS_EXTENDED_DISPLAY_DETECTED', {
              screen_count: count,
              is_extended: true,
              timestamp_ms: performance.now(),
            });
          }
        });
      } catch {
        // Fallback to window.screen.isExtended polling if permission denied
      }
    }

    if (isExtended || screenCount > 1) {
      onViolation('OBS_EXTENDED_DISPLAY_DETECTED', { screen_count: screenCount, is_extended: isExtended });
      return false; // Block onboarding until secondary monitor is unplugged
    }

    // 2. Request Mandatory Full-Monitor Screen Share
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 10, max: 15 },
      },
      audio: false,
      // @ts-ignore - Chromium standard flags to prevent tab-only sharing
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      monitorTypeSurfaces: 'include',
    });

    const videoTrack = this.screenStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings() as MediaTrackSettings & { displaySurface?: string };

    if (settings.displaySurface !== 'monitor') {
      videoTrack.stop();
      onViolation('OBS_INVALID_SCREEN_SHARE_SURFACE', { selected_surface: settings.displaySurface });
      return false; // Reject 'browser' (tab) or 'window' shares; require entire 'monitor'
    }

    videoTrack.addEventListener('ended', () => {
      onViolation('OBS_INVALID_SCREEN_SHARE_SURFACE', { reason: 'Candidate stopped screen sharing' });
    });

    // 3. Bind Tab Switch (visibilitychange), Window Blur & Fullscreen Listeners
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        onViolation('OBS_TAB_HIDDEN', { visibility: 'hidden', timestamp_ms: performance.now() });
      }
    });

    window.addEventListener('blur', () => {
      onViolation('OBS_WINDOW_BLUR', { focused: false, timestamp_ms: performance.now() });
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        onViolation('OBS_FULLSCREEN_EXIT', { fullscreen: false, timestamp_ms: performance.now() });
      }
    });

    // 4. Intercept Restricted Shortcuts & Clipboard Paste
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const isInspect = (e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'F12';
      const isCopyPaste = (e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase());
      if (isInspect || isCopyPaste || e.key === 'PrintScreen' || e.altKey || e.metaKey) {
        onViolation('OBS_RESTRICTED_HOTKEY_OR_PASTE', {
          key: e.key,
          ctrl: e.ctrlKey,
          alt: e.altKey,
          meta: e.metaKey,
        });
      }
    });

    return true;
  }
}
```

---

### 5.3 Implementation Blueprint 2: Constant Eye Movement, Saccade Rhythm & Gaze Analyzer (`packages/edge-proctor-sdk/src/gazeSaccadeAnalyzer.ts`)

Using MediaPipe Face Landmarker (`refineLandmarks: true`), the worker extracts 3D coordinates for the left iris (`468–472`), right iris (`473–477`), and eye corners (`33, 133, 362, 263`) at `30 FPS`:

1. **Normalized Horizontal & Vertical Iris Ratio ($g_x, g_y$):**
   $$g_x = \frac{1}{2}\left(\frac{\|P_{468} - P_{33}\|}{\|P_{133} - P_{33}\|} + \frac{\|P_{473} - P_{362}\|}{\|P_{263} - P_{362}\|}\right) \in [0, 1]$$
   Combined with 3D Head Pose $(\text{Yaw}, \text{Pitch})$ solved via OpenCV `solvePnP` on canonical 3D facial points (`1, 33, 263, 61, 291, 199`), yielding composite gaze angles $(\Theta_x(t), \Theta_y(t))$ in degrees.

2. **Algorithmic Separation of Reading Saccades vs. Constant Darting vs. Benign Thinking:**
   ```python
   class GazeTrajectoryAnalyzer:
       def __init__(self, fps: int = 30):
           self.fps = fps
           self.window_sec = 15.0
           self.buffer = deque(maxlen=int(fps * self.window_sec)) # (timestamp_ms, theta_x, theta_y)

       def update_and_classify(self, ts_ms: int, theta_x: float, theta_y: float) -> list[dict]:
           self.buffer.append((ts_ms, theta_x, theta_y))
           if len(self.buffer) < self.fps * 5:
               return []

           events = []
           angles_x = np.array([p[1] for p in self.buffer])
           angles_y = np.array([p[2] for p in self.buffer])
           dt = np.diff([p[0] for p in self.buffer]) / 1000.0
           vel_x = np.diff(angles_x) / np.maximum(dt, 1e-3) # deg/sec
           vel_y = np.diff(angles_y) / np.maximum(dt, 1e-3)
           angular_speed = np.hypot(vel_x, vel_y)

           # 1. Detect High-Frequency Constant Eye Darting (>= 10 rapid saccades > 120 deg/s in 15s)
           saccade_peaks = np.where(angular_speed > 120.0)[0]
           distinct_saccades = count_debounced_peaks(saccade_peaks, min_gap_frames=4)
           gaze_dispersion = float(np.std(angles_x) + np.std(angles_y))

           if distinct_saccades >= 10 and gaze_dispersion > 14.0:
               events.append({
                   "event_type": "OBS_HIGH_FREQ_EYE_DARTING",
                   "saccade_count_15s": int(distinct_saccades),
                   "dispersion_deg": round(gaze_dispersion, 2)
               })

           # 2. Detect Horizontal Reading Saccades (Slow L->R drift + Fast R->L carriage return)
           # Reading signature: 0.8s-2.5s of positive vel_x (5 to 35 deg/s) followed by sharp negative vel_x (< -90 deg/s)
           line_sweeps = detect_reading_sawtooth_waves(angles_x, vel_x, self.fps)
           if line_sweeps >= 3:
               events.append({
                   "event_type": "OBS_HORIZONTAL_READING_SACCADE",
                   "consecutive_line_sweeps": int(line_sweeps),
                   "confidence": min(0.99, 0.65 + 0.1 * line_sweeps)
               })

           return events
   ```

---

### 5.4 Implementation Blueprint 3: Real-Time Lip-Sync & Audio-Visual Voice Correlation (`apps/proctor-forensics-worker/lip_sync_verifier.py`)

The Lip-Sync Verification subsystem operates as a **Dual-Stage Pipeline** (Edge Kinematic MAR Tracker + Server Neural SyncNet Verifier) to catch proxy speakers, audio injection, and silent mouthing:

```python
class AudioVisualLipSyncVerifier:
    """
    Runs on synchronized RTP Audio (48kHz) and Primary Video (30fps) streams.
    Detects:
      1. OBS_VOICE_WITHOUT_LIP_MOTION (Off-screen proxy speaker or virtual mic injection)
      2. OBS_LIP_MOTION_WITHOUT_VOICE (Candidate silently mouthing prompts to helper/device)
      3. OBS_AV_SYNC_PHASE_MISMATCH (Candidate fake lip-syncing / miming to another voice)
    """
    def __init__(self, baseline_profile: dict, syncnet_model: SyncNetModel):
        self.mar_rest = baseline_profile.get("mar_rest", 0.02)
        self.hw_offset_ms = baseline_profile.get("av_hw_offset_ms", 0)
        self.onboarding_voice_emb = np.array(baseline_profile["voice_embedding"])
        self.syncnet = syncnet_model

    def evaluate_2sec_window(
        self,
        mar_series: np.ndarray,        # Shape: (60,) at 30 FPS — Mouth Aspect Ratio
        vad_probs: np.ndarray,         # Shape: (60,) at 30 FPS — Silero VAD speech probability
        mouth_crops: np.ndarray,       # Shape: (60, 96, 96, 3) — Cropped lip region frames
        audio_pcm_16k: np.ndarray      # Shape: (32000,) — 2.0 seconds of 16kHz audio
    ) -> list[dict]:
        anomalies = []
        speech_active_ratio = float(np.mean(vad_probs > 0.70))
        mar_std = float(np.std(mar_series))
        mar_dynamic_range = float(np.percentile(mar_series, 90) - np.percentile(mar_series, 10))

        # Mode 1: Active Speech in Microphone, but Candidate's Lips are Static/Closed
        if speech_active_ratio > 0.80 and mar_std < 0.012 and mar_dynamic_range < 0.035:
            anomalies.append({
                "event_type": "OBS_VOICE_WITHOUT_LIP_MOTION",
                "severity": "HIGH",
                "confidence": 0.94,
                "telemetry": {
                    "speech_active_ratio": round(speech_active_ratio, 3),
                    "mar_std": round(mar_std, 4),
                    "mar_range": round(mar_dynamic_range, 4)
                }
            })
            return anomalies

        # Mode 2: Candidate Actively Mouthing Words, but Microphone has Zero Speech
        if speech_active_ratio < 0.10 and mar_std > 0.045 and mar_dynamic_range > 0.16:
            anomalies.append({
                "event_type": "OBS_LIP_MOTION_WITHOUT_VOICE",
                "severity": "MEDIUM",
                "confidence": 0.86,
                "telemetry": {
                    "speech_active_ratio": round(speech_active_ratio, 3),
                    "mar_std": round(mar_std, 4),
                    "mar_range": round(mar_dynamic_range, 4)
                }
            })
            return anomalies

        # Mode 3: Both Speech and Lip Movement Present -> Verify Phoneme-Viseme Sync via SyncNet
        if speech_active_ratio > 0.60 and mar_dynamic_range >= 0.04:
            sync_confidence, av_offset_ms = self.syncnet.compute_sync(mouth_crops, audio_pcm_16k)
            corrected_offset_ms = abs(av_offset_ms - self.hw_offset_ms)

            # Check Speaker Identity against Onboarding Voice Embedding
            current_voice_emb = extract_speaker_embedding(audio_pcm_16k)
            voice_cosine_dist = float(cosine_distance(self.onboarding_voice_emb, current_voice_emb))

            if sync_confidence < 0.32 or corrected_offset_ms > 300 or voice_cosine_dist > 0.45:
                anomalies.append({
                    "event_type": "OBS_AV_SYNC_PHASE_MISMATCH",
                    "severity": "HIGH" if voice_cosine_dist > 0.45 else "MEDIUM",
                    "confidence": round(max(1.0 - sync_confidence, voice_cosine_dist), 3),
                    "telemetry": {
                        "syncnet_confidence": round(float(sync_confidence), 3),
                        "av_offset_ms": int(corrected_offset_ms),
                        "speaker_cosine_distance": round(voice_cosine_dist, 3)
                    }
                })

        return anomalies
```

---

### 5.5 Module E: Secondary Smartphone Camera Pairing & Protocol Specification

1. **Token Generation (`POST /api/v1/sessions/{session_id}/secondary-cam/token`):**
   * Generates a `128-bit` cryptographic nonce and signs a short-lived JWT (`HS256`, `TTL = 300s`):
     ```json
     {
       "sub": "secondary_cam_pair",
       "session_id": "8f14e45f-ceea-467f-a8f0-15b3a7652c11",
       "nonce": "c9a8f1b2e4d3",
       "exp": 1761349500
     }
     ```
   * Desktop UI renders `https://<host>/m/pair?t=<jwt>` inside a high-contrast SVG QR code.
2. **Smartphone Handshake (`POST /api/v1/mobile/handshake`):**
   * Mobile Safari/Chrome scans the QR code, opens the PWA page, validates the token, marks the nonce as consumed in Redis (`SETNX`), and receives a LiveKit room token restricted to:
     * `canPublish: true`, `canPublishSources: ["camera"]`, `canSubscribe: false` (saves mobile battery and bandwidth).
3. **Orientation, Wake-Lock & Disconnect Watchdog:**
   * Requests rear camera (`facingMode: { ideal: "environment" }`) at `1280x720 @ 15fps` and acquires Screen Wake Lock (`navigator.wakeLock.request("screen")`).
   * Sends a `1,000ms` WebSocket heartbeat. If the mobile connection drops for `> 2,000ms`, the SFU webhook immediately logs `OBS_SECONDARY_CAM_DISCONNECTED` and pushes a `RECONNECT_QR` event to the candidate desktop UI.

---

### 5.6 Module F: Bias-Insulated Multi-Pass Candidate Evaluation Engine

#### 5.6.1 Modality Isolation & Sanitization Gate
Before any interview data enters the evaluation worker (`apps/evaluation-worker/evaluator.py`), a deterministic **Sanitization Filter** strips all non-textual and demographic proxies:
* **Included Inputs:** Job Title, Job Description, Required Skills, Candidate Resume Text/JSON, Question Prompt, Expected Answer Rubric, and Sanitized Verbatim Text Transcript with relative word timestamps.
* **Strictly Excluded Inputs:** Raw audio files, speaking rate (WPM), pause durations, acoustic pitch/timbre, accent metadata, video frames, facial landmarks, and proctoring logs (proctoring is kept in a separate track on the dashboard so integrity alerts never contaminate technical competency grading).

#### 5.6.2 Structured LLM Judge Output Schema (`Pydantic`)
```python
class VerbatimQuote(BaseModel):
    quote: str = Field(description="Exact verbatim substring from candidate_transcript")
    timestamp_start_ms: int
    timestamp_end_ms: int

class DimensionScorecard(BaseModel):
    technical_correctness: int = Field(ge=1, le=5)
    relevance: int = Field(ge=1, le=5)
    completeness: int = Field(ge=1, le=5)
    demonstrated_understanding: int = Field(ge=1, le=5)

class QuestionEvaluationResult(BaseModel):
    question_id: UUID
    response_summary: str
    dimension_scores: DimensionScorecard
    weighted_question_score: float = Field(ge=1.0, le=5.0)
    verbatim_evidence_quotes: list[VerbatimQuote] = Field(min_length=1)
    strengths_demonstrated: list[str]
    knowledge_gaps_identified: list[str]
    evaluation_rationale: str
```

---

## 6. REST & WebSocket API Contracts

### 6.1 Core REST Endpoints (`apps/api-gateway`)

| Method | Endpoint | Description | Auth Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/interviews/config` | Create interview configuration, rubric, and anti-cheat policy (defaults to `10` questions if omitted). | `Recruiter` |
| `POST` | `/api/v1/interviews/{config_id}/candidates` | Upload candidate PDF/DOCX resume, parse entities, and generate deduplicated question blueprint. | `Recruiter` |
| `GET` | `/api/v1/interviews/{session_id}/blueprint` | Retrieve generated + custom questions; allows recruiter to edit, reorder, or lock questions pre-interview. | `Recruiter` |
| `POST` | `/api/v1/sessions/{session_id}/consent` | Record candidate informed consent for primary A/V, secondary mobile cam, full-screen share, and AI proctoring. | `Candidate` |
| `POST` | `/api/v1/sessions/{session_id}/onboarding-verify` | Submit hardware check, display topology audit (`isExtended === false`, `surface === 'monitor'`), and lip-sync calibration baseline. | `Candidate` |
| `POST` | `/api/v1/sessions/{session_id}/secondary-cam/token` | Generate ephemeral 5-minute QR pairing JWT for smartphone secondary camera. | `Candidate` |
| `POST` | `/api/v1/mobile/handshake` | Validate QR token from smartphone browser and issue LiveKit secondary camera publish token. | `MobileToken` |
| `GET` | `/api/v1/reports/{session_id}` | Fetch complete evaluation report, question scores, verbatim evidence, 3-stream signed video URLs, and proctoring timeline. | `Recruiter` |
| `PATCH` | `/api/v1/reports/{session_id}/questions/{q_id}/override` | Override AI question score (`1–5`) with mandatory recruiter audit reason. | `Recruiter` |
| `PATCH` | `/api/v1/reports/{session_id}/incidents/{inc_id}/disposition` | Mark a proctoring incident as `VERIFIED_CONCERN` or `DISMISSED_FALSE_ALARM`. | `Recruiter` |

### 6.2 Real-Time WebSocket & DataChannel Protocol (`/ws/session/{session_id}`)

**Client $\rightarrow$ Server Telemetry Packet (`10Hz` periodic + instant on violation):**
```json
{
  "type": "EDGE_TELEMETRY_FRAME",
  "seq": 1482,
  "session_time_ms": 148200,
  "active_question_id": "d4f9...",
  "browser_env": {
    "visibility": "visible",
    "window_focused": true,
    "is_fullscreen": true,
    "is_extended_display": false,
    "screen_count": 1,
    "screen_share_surface": "monitor"
  },
  "face_and_gaze": {
    "face_count": 1,
    "head_yaw_deg": -4.2,
    "head_pitch_deg": 2.1,
    "gaze_theta_x_deg": -6.5,
    "gaze_theta_y_deg": 1.8,
    "saccade_count_15s": 2,
    "reading_sawtooth_sweeps": 0
  },
  "lip_sync_edge": {
    "mar_value": 0.214,
    "mar_std_2s": 0.068,
    "local_vad_prob": 0.92
  }
}
```

---

## 7. Security, Privacy & Anti-Tampering Controls

1. **Server-Authoritative Media Forensics:**
   * Malicious candidates cannot bypass proctoring by overriding client-side JavaScript functions because the server-side `proctor-forensics-worker` independently subscribes to the raw RTP video/audio tracks on the LiveKit SFU to run **YOLOv8x** (person, phone, extra monitor detection), **SyncNet** (lip-sync verification), and **PyAnnote** (multi-speaker diarization).
   * Additionally, every client telemetry packet must carry a monotonic sequence number and match the server-observed video stream state; discrepancies between client telemetry and server CV trigger an automatic `INF_CLIENT_TELEMETRY_TAMPERING` alert.
2. **Cryptographic Media & Storage Security:**
   * WebRTC streams enforce `DTLS-SRTP` encryption.
   * All 3 video tracks (Primary, Secondary Smartphone, Full-Monitor Screen Share) and audio tracks are muxed into segmented MP4/HLS files encrypted with `AES-256-GCM` in S3.
   * Recruiter dashboard video players use short-lived CloudFront/S3 pre-signed URLs (`TTL = 900 seconds`) bound to the recruiter's authenticated session.

---

## 8. End-to-End Automated Verification & Acceptance Test Plan

Every deployment must pass the following automated integration and hardware-in-the-loop simulation suite prior to release:

| Test ID | Verification Target | Automated Test Input / Simulation | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **`TRD-T01`** | **Default-10 Question Rule & Deduplication** | Submit `POST /interviews/config` with `question_count = null` and upload a Java/Spring Boot PDF resume. | Database contains exactly `10` primary questions (`primary_index 1..10`), pairwise embedding cosine similarity `< 0.82` across all 10 questions. |
| **`TRD-T02`** | **Bounded Follow-Up & Time Guardrail** | Configure `10` questions, `max_follow_ups = 1`. Simulate vague candidate answer on `Q1`, and simulate `< 75s` remaining time on `Q9`. | System asks `Q1.a` after `Q1`, then advances to `Q2`. On `Q9`, system suppresses follow-up due to `< 90s` time guardrail and completes `Q10` on time. |
| **`TRD-T03`** | **Tab Switch & Window Blur Detection** | Simulate `visibilitychange -> hidden` and `window.blur` for `3.5s` during active `Q3`. | Incident `OBS_TAB_HIDDEN` logged within `< 200ms`; escalated to `INF_UNAUTHORIZED_EXTERNAL_LOOKUP` with attached `10s` screen-share MP4 clip. |
| **`TRD-T04`** | **Extended Screen Share & Multi-Monitor Block** | Inject mock `window.screen.isExtended = true` or `displaySurface = 'browser'` during onboarding; then simulate hot-plugging HDMI display mid-interview. | Onboarding gate blocks progression until single full-monitor share is selected. Mid-interview hot-plug pauses active question and logs `OBS_EXTENDED_DISPLAY_DETECTED`. |
| **`TRD-T05`** | **Constant Eye Movement & Reading Saccades vs. Benign Gaze** | Feed synthetic video stream A (2.8s upward thinking glance) and video stream B (4 horizontal left-to-right reading sweeps at `15°` amplitude). | Stream A triggers **zero** alerts (`0%` false alarm). Stream B logs `OBS_HORIZONTAL_READING_SACCADE` and escalates to `INF_OFFSCREEN_SCRIPT_OR_COPILOT_READING`. |
| **`TRD-T06`** | **Lip-Sync Verification (Proxy / Dubbing Check)** | Feed video stream with static closed lips (`MAR_std = 0.006`) while injecting clear technical speech audio (`VAD = 0.95`) for `3.0s`; then feed mismatched audio (`+650ms` lag). | Detector flags `OBS_VOICE_WITHOUT_LIP_MOTION` on test 1 and `OBS_AV_SYNC_PHASE_MISMATCH` (`SyncNet < 0.32`) on test 2, escalating to `INF_PROXY_SPEAKER_OR_AUDIO_INJECTION`. |
| **`TRD-T07`** | **Secondary Smartphone QR Pairing & Disconnect** | Scan QR token on mobile headless browser, stream rear camera, then terminate mobile WebSocket after `30s`. | Pairing completes in `< 2.5s`; disconnect logged within `< 2.0s` as `OBS_SECONDARY_CAM_DISCONNECTED` with reconnect QR banner displayed on desktop. |
| **`TRD-T08`** | **Bias-Insulated Rubric Evaluation & Override** | Run evaluation worker on identical technical transcripts delivered with (a) slow accented speech vs. (b) fast native speech; then execute recruiter score override. | Both transcripts receive identical `1–5` rubric scores (`Δ <= 0.1`) with verbatim quote citations; recruiter override updates score and writes immutable audit record. |
