# Design System Specification: Proctra AI Interview & Proctoring Agent

## 1. Product Context & Design Philosophy

### 1.1 Purpose
Proctra is an enterprise-grade AI-powered autonomous video interview platform with real-time multi-angle proctoring. The design system bridges two distinct user workflows:
1. **Candidate Experience (Focus, Clarity, Calmness):** High-stakes, high-anxiety environment. The UI must be non-intrusive, clear, and focused on reducing cognitive load while ensuring transparency around device monitoring.
2. **Recruiter Experience (Data Density, Auditability, Efficiency):** High-throughput analytical environment. The UI must deliver dense, verifiable candidate evaluation metrics, synchronized video replay, and timestamped proctoring incident audits.

### 1.2 Core Design Principles
* **Objective Neutrality:** Avoid accusatory visual design (e.g., avoid flashing red warnings in candidate views). Proctoring items are labeled as "Review Events" or "Flags" rather than "Cheating Detected."
* **Low Latency & High Legibility:** High contrast, minimal visual noise, and micro-interactions optimized for video rendering and screen captures.
* **Dual-View Ergonomics:** Seamless visual handling of primary webcam and secondary mobile feeds (Picture-in-Picture, Split Screen, and Sync Timelines).

---

## 2. Foundations: Tokens & Core Styling

### 2.1 Color Palette

#### Primary & Brand (Indigo / Precision Tech)
* `--brand-50`: `#EEF2FF`
* `--brand-100`: `#E0E7FF`
* `--brand-500`: `#6366F1` *(Primary CTAs, AI Avatar indicators)*
* `--brand-600`: `#4F46E5` *(Primary Hover / Active States)*
* `--brand-900`: `#312E81`

#### Neutral & Surface Scales (Dark Slate / Video Canvas)
Used for video frames, dashboard backgrounds, and high-contrast text.
* `--slate-950`: `#090D16` *(Candidate Video Arena background)*
* `--slate-900`: `#0F172A` *(Sidebar and container surface)*
* `--slate-800`: `#1E293B` *(Card background, secondary surface)*
* `--slate-700`: `#334155` *(Borders, dividers, video viewport outlines)*
* `--slate-500`: `#64748B` *(Placeholder text, subtle metadata)*
* `--slate-300`: `#CBD5E1` *(Muted text, subheaders)*
* `--slate-100`: `#F1F5F9` *(Light surface mode)*
* `--slate-50`: `#F8FAFC` *(Light canvas background)*

#### Semantic & Proctoring State Colors
* **Integrity Verified / Success:**
  * `--success-500`: `#10B981` (Normal stream, camera active, valid answer submitted)
  * `--success-50`: `#ECFDF5`
* **Advisory / Low-Confidence / Gaze Divergence:**
  * `--warning-500`: `#F59E0B` (Gaze off-screen, brief face occlusion, background noise)
  * `--warning-50`: `#FFFBEB`
* **Audit Required / Anomaly Detected:**
  * `--danger-500`: `#EF4444` (Multiple faces, persistent absence, secondary device disconnect)
  * `--danger-50`: `#FEF2F2`
* **Agent / Machine Intelligence:**
  * `--ai-500`: `#8B5CF6` (AI speaking, active reasoning, question synthesis)
  * `--ai-gradient`: `linear-gradient(135deg, #6366F1 0%, #A855F7 100%)`

---

### 2.2 Typography

* **Font Families:**
  * Primary Sans: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  * Monospace / Data: `JetBrains Mono, "Fira Code", monospace` (Timestamps, proctoring events, confidence scores)

* **Type Scale & Hierarchy:**
| Token | Size | Line Height | Weight | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `text-display` | 32px | 40px | 700 (Bold) | Recruiter Summary Score, High-level Stats |
| `text-h1` | 24px | 32px | 600 (SemiBold) | Section Headers, Interview Title |
| `text-h2` | 20px | 28px | 600 (SemiBold) | Card Headers, Candidate Name |
| `text-h3` | 16px | 24px | 600 (SemiBold) | Question Headers, Rubric Criteria |
| `text-body` | 14px | 20px | 400 (Regular) | Candidate Answers, Explanations, Transcripts |
| `text-body-sm` | 12px | 18px | 400 (Regular) | Meta descriptors, Job skill badges |
| `text-mono-sm` | 12px | 16px | 500 (Medium) | Proctoring timestamp badges (`00:14:28.120`) |

---

### 2.3 Spacing, Borders & Shadows

* **Spacing Grid:** 4px baseline system (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`).
* **Radius Tokens:**
  * `radius-sm`: `4px` (Tags, status dots)
  * `radius-md`: `8px` (Buttons, inputs, badge chips)
  * `radius-lg`: `12px` (Cards, video stream containers, modals)
  * `radius-full`: `9999px` (Pills, user avatars, status rings)
* **Depth & Elevation:**
  * `shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
  * `shadow-card`: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)`
  * `shadow-overlay`: `0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)`

---

## 3. UI Component Specifications

### 3.1 Candidate Stage & Autonomous Interviewer Layout

#### Video Container (Primary + Secondary Stream)
* **Primary Canvas:** 16:9 aspect ratio, anchored in center. Dark background (`--slate-950`) to minimize optical bleed.
* **Secondary Stream PiP (Mobile Angle):**
  * Position: Bottom-right corner with 16px inset.
  * Size: 220px width (portrait or 4:3 landscape ratio).
  * Border: `2px solid var(--slate-700)`, turns `2px solid var(--danger-500)` if disconnected.
  * Label: Floating pill badge (`CAM-02: MOBILE`) with pinging green indicator dot.

#### Virtual Interviewer Avatar & State Bar
* **Voice Activity Indicator:** Pulse ring or dynamic SVG waveform placed at the top-left or centered above the question card.
  * *Interviewer Speaking:* Waveform dynamic purple-indigo (`--ai-gradient`).
  * *Listening to Candidate:* Soft green pulse (`--success-500`) with audio level meter.
  * *Thinking / Evaluating:* Neutral indigo shimmer / spinning glow.
* **Current Question Billboard:**
  * Floating translucent card at the top-center (`background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px)`).
  * Displays: Question number (e.g., "Question 3 of 10"), difficulty badge, question text, and elapsed response countdown.

---

### 3.2 Candidate Onboarding & Secondary Device Pairing Modal

#### Device Diagnostic Matrix
* Three-step linear stepper:
  1. Primary Camera & Mic Test (with mic VU meter test).
  2. Consent & Privacy Agreement (explicit camera recording & proctoring disclosure).
  3. Secondary Device QR Sync.

#### QR Code Handshake Component
* Center-aligned high-contrast SVG QR code.
* One-time encrypted URL (`https://app.domain/pair?token=xyz123`).
* Visual status indicator:
  * `Awaiting Scan...` (Amber pulse)
  * `Device Connected: iPhone 14 Pro (Wide Workspace View)` (Green checkmark with real-time video thumbnail preview).

---

### 3.3 Recruiter Dashboard & Analytical Evaluation Components

#### Question-by-Question Evaluation Card
* **Header:** Question Category (Technical / Behavioral / Scenario), Target Skill (e.g., `Spring Boot Microservices`), Score (e.g., `4.5 / 5.0`).
* **Substance Split View:**
  * *Left:* Candidate Spoken Transcript with time offsets.
  * *Right:* AI Critique, verified core competencies, identified knowledge gaps, and direct quote justification.

#### Synchronized Proctoring Audit Timeline
* Horizontal or vertical interactive timeline scrub bar synced to video playback.
* Severity markers:
  * 🟡 **Amber Tick:** Gaze off-screen > 5s.
  * 🔴 **Red Tick:** Face absent, multiple people detected, secondary feed lost.
* **Event Card Component:**
  * Thumbnail snapshot captured at the exact second.
  * Event Type (`MULTIPLE_FACES_DETECTED`, `SECONDARY_DISCONNECT`).
  * Confidence rating (`Confidence: 94%`).
  * Action: `Review Segment (+/- 5s)` and `Dismiss / Override`.

---

## 4. Interaction Patterns & States

### 4.1 Real-Time Audio & Turn-Taking Feedback
* **Silence Handling:** When silence exceeds 8 seconds during an open answer, a subtle tooltip appears: *"Are you ready to submit your answer or would you like more time?"* (avoiding abrupt agent interruptions).
* **Interrupt Safety:** If candidate begins speaking while the TTS virtual interviewer is vocalizing, the TTS audio ducks to 0 immediately (echo cancellation + speech-priority latch).

### 4.2 Network Resilience & Stream Disconnection
* When connection jitter occurs:
  * Primary banner: *"Re-establishing connection... Your interview progress is paused and preserved."*
  * Timer stops automatically. No penalty or cheating flag is triggered for momentary dropouts under 15 seconds.

---

## 5. Accessibility (a11y) & Ethical AI Safeguards

* **Closed Captions (CC):** Live Speech-To-Text transcription displayed as high-contrast toggleable captions for candidates with hearing impairments.
* **Non-Discriminatory Design:**
  * The evaluation UI explicitly disallows scoring based on tone, accent, pitch, or physical appearance.
  * Dashboard indicators strictly output "Answer Content Score" and "Integrity Observation Log," separating semantic merit from proctoring signals.
* **Contrast Compliance:** All functional text meets WCAG 2.1 AA standards (minimum 4.5:1 ratio against dark and light surfaces).