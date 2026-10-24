# Project Roadmap & Task Breakdown: Proctra AI Interview Agent

## Status Overview
- **Project State:** Sprint Planning & Architecture
- **Target Deliverable:** Complete working hackathon prototype (Recruiter setup, AI Interviewer, Dual-Camera Proctoring, Evaluation Engine, Recruiter Dashboard)
- **Status Key:**
  - `[ ]` Not Started
  - `[/]` In Progress
  - `[x]` Completed
  - `[!]` Blocked / High Risk

---

## Phase 1: Architecture & Foundation Setup

- [ ] **1.1 Project Scaffolding & Environment Setup**
  - [ ] Set up monorepo / project structure (`frontend`, `backend`, `ai-service`).
  - [ ] Configure environment variables (LLM APIs, STT/TTS credentials, WebRTC TURN/STUN).
  - [ ] Initialize CSS framework / design token integration based on `design-system.md`.
- [ ] **1.2 Data Schema & State Management**
  - [ ] Define database schemas: `JobPostings`, `Candidates`, `Interviews`, `Questions`, `Responses`, `ProctoringEvents`.
  - [ ] Define WebSocket/WebRTC signaling event structures for interview sessions and dual feeds.

---

## Phase 2: Recruiter Portal & Candidate Onboarding

- [ ] **2.1 Interview Configuration Module**
  - [ ] Build form for Job Role, Description, Skill Tags, Experience Level, and Target Duration.
  - [ ] Implement Question Count configuration (default to 10 if unspecified).
  - [ ] Implement Resume Parser (PDF/DOCX extraction: education, skills, work experience, projects).
  - [ ] Recruiter-defined question addition UI (mixing manual + AI questions).
- [ ] **2.2 Candidate Onboarding & Device Check Flow**
  - [ ] Implement camera and microphone permission request wizard.
  - [ ] Implement audio level (VU meter) visualizer and camera preview test.
  - [ ] Add explicit consent & privacy modal explaining video/audio recording and proctoring.
- [ ] **2.3 Smartphone Secondary Camera Integration**
  - [ ] Generate unique session QR code and pairing token on candidate desktop screen.
  - [ ] Develop mobile-optimized browser client (`/pair?token=...`) to access smartphone back/front camera.
  - [ ] Establish peer-to-peer WebRTC connection streaming mobile video back to the candidate/session feed.
  - [ ] Add secondary camera disconnect event listener and visual indicator.

---

## Phase 3: Autonomous AI Interview Engine

- [ ] **3.1 AI Question Generation Engine**
  - [ ] Integrate LLM to cross-analyze JD requirements against extracted resume profile.
  - [ ] Generate structured questions (Technical, Behavioral, Scenario-based, Experience-based).
  - [ ] Enforce difficulty calibration based on candidate seniority level.
  - [ ] De-duplication logic to ensure distinct, non-repetitive questioning.
- [ ] **3.2 Speech-to-Text & Text-to-Speech Integration**
  - [ ] Implement realistic TTS for virtual interviewer voice output.
  - [ ] Implement STT for candidate live response capture with real-time transcription.
  - [ ] Implement silence detection threshold (e.g., 8s) and prompt handling.
  - [ ] Add speech interruption / barging handling (TTS instantly mutes when candidate speaks).
- [ ] **3.3 Dynamic Context & Adaptive Follow-Up Logic**
  - [ ] Session context tracker to retain previous answers and generate 1 targeted follow-up where warranted.
  - [ ] Safety cap to maintain fixed question counts without exceeding configured interview duration.
  - [ ] UI for question progress indicator, response countdown timer, and live captions.

---

## Phase 4: Intelligent Anti-Cheating & Proctoring Module

- [ ] **4.1 Computer Vision Pipeline (Primary & Secondary Feeds)**
  - [ ] Face presence detection (flag prolonged absence > 10s).
  - [ ] Multiple person detection (flag secondary faces in frame).
  - [ ] Head pose and gaze tracking (detect sustained off-screen lookaways without false alarm on natural glances).
- [ ] **4.2 Audio Anomaly & Environment Monitoring**
  - [ ] Background voice detection (separate secondary human speech from candidate speech).
  - [ ] Mic/Cam disconnect detection (detect muted device, stream interruption).
- [ ] **4.3 Incident Logging & Evidence Store**
  - [ ] Capture timestamped snapshot thumbnail and 5-second video buffer when an event triggers.
  - [ ] Log event payload: `{ timestamp, eventType, confidence, severity, snapshotUrl }`.
  - [ ] Ensure non-punitive logging ("Advisory Flag" vs "Hard Disqualification").

---

## Phase 5: Candidate Evaluation & Scoring Engine

- [ ] **5.1 Multi-Dimensional Rubric Engine**
  - [ ] Implement question-level scoring (1 to 5 scale) on:
    - Technical Correctness & Depth
    - Relevance & Completeness
    - Communication & Articulation
  - [ ] Extract verbatim quotes from transcript as justification for assigned scores.
- [ ] **5.2 Role Competency & Knowledge Gap Analysis**
  - [ ] Match response substance against JD skill criteria.
  - [ ] Generate structured Candidate Strengths, Weaknesses, and Knowledge Gaps report.
  - [ ] Overall interview synthesis with executive hiring recommendation (Proceed / Caution / Reject).

---

## Phase 6: Recruiter Dashboard & Final Deliverables

- [ ] **6.1 Recruiter Review Interface**
  - [ ] Candidate overview page (scores, job role, duration, completion status).
  - [ ] Synchronized video playback synced with proctoring timeline scrub bar.
  - [ ] Interactive proctoring timeline (colored markers for amber/red flags with instant preview).
  - [ ] Recruiter score override & manual comment panel.
- [ ] **6.2 Testing & Prototype Verification**
  - [ ] Run end-to-end dry run: Resume upload -> 10 questions -> Mock interview -> Evaluation report.
  - [ ] Test mobile QR connection across Android and iOS browsers.
  - [ ] Simulate proctoring edge cases (person walks behind, candidate looks down, phone disconnect).
- [ ] **6.3 Documentation & Demo Preparation**
  - [ ] Complete architecture diagram and API flow documentation.
  - [ ] Record a 3-5 minute end-to-end demonstration video.
  - [ ] Document project limitations, privacy compliance, and future roadmap.