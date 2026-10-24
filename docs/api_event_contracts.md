# API & Event Contracts: Proctra AI Interview & Proctoring Agent

This document defines the interface specifications across the application lifecycle: RESTful endpoints, WebRTC/WebSocket signaling schemas, and real-time proctoring event payloads.

---

## 1. REST API Specification

All REST requests and responses use JSON (`Content-Type: application/json`) unless handling file uploads (`multipart/form-data`). Timestamps follow ISO-8601 UTC format.

### 1.1 Job & Interview Management

#### `POST /api/v1/jobs`
Creates a new job profile and parses requirements.

* **Request (`multipart/form-data`):**
  * `title` (string, required): e.g., `"Senior Backend Engineer"`
  * `description` (string, required): Full text or markdown of job description.
  * `experience_level` (enum, required): `"entry" | "mid" | "senior" | "lead"`
  * `required_skills` (string, comma-separated): `"Go, Kubernetes, PostgreSQL, gRPC"`

* **Response (`201 Created`):**
```json
{
  "job_id": "job_01HZX87K9B1QPR9W4M6T",
  "title": "Senior Backend Engineer",
  "experience_level": "senior",
  "extracted_skills": ["Go", "Kubernetes", "PostgreSQL", "gRPC", "Distributed Systems"],
  "created_at": "2026-10-25T00:15:30Z"
}
```

---

#### `POST /api/v1/interviews`
Configures and initializes an interview session for a candidate.

* **Request (`multipart/form-data`):**
  * `job_id` (string, required): Associated job UUID.
  * `candidate_name` (string, required): Candidate full name.
  * `candidate_email` (string, required): Candidate email.
  * `resume_file` (binary, required): PDF or DOCX file (max 10MB).
  * `question_count` (integer, optional): Defaults to `10`.
  * `time_limit_per_question_sec` (integer, optional): Defaults to `120`.
  * `recruiter_custom_questions` (string, JSON-encoded array, optional): Custom questions to interleave.

* **Response (`201 Created`):**
```json
{
  "interview_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "candidate_id": "cand_81c7f5a2",
  "status": "pending_onboarding",
  "question_count": 10,
  "time_limit_per_question_sec": 120,
  "candidate_access_token": "jwt_candidate_session_token_xyz",
  "interview_portal_url": "https://proctra.ai/interview/intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e?token=jwt_candidate_session_token_xyz",
  "parsed_resume_preview": {
    "detected_skills": ["Go", "Docker", "PostgreSQL", "Redis"],
    "total_years_experience": 5.5,
    "recent_role": "Backend Developer at Acme Corp"
  },
  "created_at": "2026-10-25T00:16:00Z"
}
```

---

### 1.2 Candidate Onboarding & Device Check

#### `POST /api/v1/interviews/{interview_id}/consent`
Records explicit candidate privacy & biometric recording consent.

* **Headers:** `Authorization: Bearer <candidate_access_token>`
* **Request (`application/json`):**
```json
{
  "camera_mic_consent": true,
  "recording_and_ai_eval_consent": true,
  "secondary_cam_consent": true,
  "ip_address": "203.0.113.195",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
}
```
* **Response (`200 OK`):**
```json
{
  "interview_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "consent_recorded": true,
  "timestamp": "2026-10-25T00:16:45Z"
}
```

---

#### `POST /api/v1/interviews/{interview_id}/secondary-pair-token`
Generates a short-lived token and ephemeral URL for smartphone browser camera pairing.

* **Headers:** `Authorization: Bearer <candidate_access_token>`
* **Response (`200 OK`):**
```json
{
  "pair_token": "sec_pair_7f3a8b29c1e4",
  "expires_in_seconds": 600,
  "qr_pairing_url": "https://proctra.ai/mobile-cam?intv=intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e&token=sec_pair_7f3a8b29c1e4"
}
```

---

### 1.3 Recruiter Evaluation & Reports

#### `GET /api/v1/interviews/{interview_id}/report`
Retrieves synthesized candidate answers, question-level scores, and timeline flags.

* **Headers:** `Authorization: Bearer <recruiter_jwt>`
* **Response (`200 OK`):**
```json
{
  "interview_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "candidate": {
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "experience_level": "senior"
  },
  "metrics": {
    "overall_score": 4.3,
    "technical_depth_score": 4.5,
    "communication_score": 4.0,
    "integrity_incident_count": 2,
    "integrity_summary": "Low concern: 1 minor gaze deviation, 1 brief secondary camera disconnect (reconnected in 4s)."
  },
  "questions": [
    {
      "question_number": 1,
      "skill_target": "Go Concurrency & Channels",
      "question_text": "Explain how Go channels handle unbuffered vs buffered sync under high throughput.",
      "candidate_response_transcript": "With unbuffered channels, the sender blocks until the receiver is ready...",
      "score": 4.7,
      "feedback": "Candidate articulated goroutine scheduling and channel synchronization nuances clearly.",
      "evidence_quotes": [
        "the sender blocks until the receiver is ready"
      ]
    }
  ],
  "proctoring_timeline_summary": {
    "total_incidents": 2,
    "review_recommended": false
  }
}
```

---

## 2. WebSocket & WebRTC Signaling Schemas

* **Signaling Server URL:** `wss://proctra.ai/ws/session/{interview_id}`
* **Auth:** Handshake query param `?token=<access_token>&client_role=<primary_web | secondary_cam | recruiter_monitor>`

### 2.1 Protocol Framing

All WS messages adhere to a standard envelope:
```json
{
  "event": "EVENT_NAME",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "primary_web | secondary_cam | server | recruiter_monitor",
  "timestamp": 1792887405120,
  "data": {}
}
```

### 2.2 Device Pairing & Session Lifecycle

#### `CLIENT_JOIN` (Client -> Server)
Sent immediately upon WebSocket connection opening.
```json
{
  "event": "CLIENT_JOIN",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "secondary_cam",
  "timestamp": 1792887405120,
  "data": {
    "pair_token": "sec_pair_7f3a8b29c1e4",
    "device_info": "Mobile Safari / iOS 19"
  }
}
```

#### `DEVICE_STATUS_CHANGED` (Server -> Broadcast)
Notifies all active peers (Candidate desktop UI, Recruiter dashboard) of peripheral changes.
```json
{
  "event": "DEVICE_STATUS_CHANGED",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "server",
  "timestamp": 1792887406200,
  "data": {
    "device": "SECONDARY_CAMERA",
    "status": "CONNECTED",
    "resolution": "1280x720",
    "fps": 30
  }
}
```

### 2.3 WebRTC Peer-to-Peer Signaling Messages

#### `WEBRTC_OFFER` (Secondary Cam / Client -> Recruiter/Engine)
```json
{
  "event": "WEBRTC_OFFER",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "secondary_cam",
  "timestamp": 1792887406450,
  "data": {
    "target_role": "primary_web",
    "sdp": "v=0\r\no=- 461173... IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1..."
  }
}
```

#### `WEBRTC_ANSWER` (Primary Web -> Secondary Cam)
```json
{
  "event": "WEBRTC_ANSWER",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "primary_web",
  "timestamp": 1792887406600,
  "data": {
    "target_role": "secondary_cam",
    "sdp": "v=0\r\no=- 928312... IN IP4 0.0.0.0\r\ns=-\r\n..."
  }
}
```

#### `WEBRTC_ICE_CANDIDATE` (Bidirectional)
```json
{
  "event": "WEBRTC_ICE_CANDIDATE",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "secondary_cam",
  "timestamp": 1792887406750,
  "data": {
    "candidate": "candidate:842163049 1 udp 1677729535 192.168.1.150 54123 typ host ...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

### 2.4 Autonomous AI Turn-Taking & Question Flow

#### `AGENT_QUESTION_READY` (Server -> Candidate UI)
Signals virtual interviewer speaking state and begins countdown timer.
```json
{
  "event": "AGENT_QUESTION_READY",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "server",
  "timestamp": 1792887410000,
  "data": {
    "question_id": "q_04",
    "question_number": 4,
    "total_questions": 10,
    "category": "TECHNICAL_CORE",
    "question_text": "How do you mitigate goroutine leaks in high-load worker pools?",
    "audio_stream_url": "https://proctra.ai/streams/tts_cache/intv_q04.mp3",
    "allocated_time_seconds": 120
  }
}
```

#### `CANDIDATE_SPEECH_DELTA` (Candidate UI / Engine -> Server)
Real-time STT chunk streaming.
```json
{
  "event": "CANDIDATE_SPEECH_DELTA",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "primary_web",
  "timestamp": 1792887425100,
  "data": {
    "question_id": "q_04",
    "transcript_chunk": "We use context cancellation with timeout and defer cancel calls...",
    "is_final": false,
    "silence_duration_ms": 0
  }
}
```

#### `CANDIDATE_ANSWER_COMPLETED` (Candidate UI -> Server)
Triggered by explicit submission or sustained silence cutoff.
```json
{
  "event": "CANDIDATE_ANSWER_COMPLETED",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "primary_web",
  "timestamp": 1792887480500,
  "data": {
    "question_id": "q_04",
    "total_response_time_ms": 70500,
    "final_transcript": "We use context cancellation with timeout and defer cancel calls to make sure blocked goroutines exit on context completion."
  }
}
```

---

## 3. Real-Time Proctoring & Event Schemas

The proctoring engine (running on edge client or inference workers) transmits incident telemetry to the event pipeline using this schema.

### 3.1 Event Classification Enum

| Event Type Code | Severity | Description |
| :--- | :--- | :--- |
| `NO_FACE_DETECTED` | `WARNING` | Primary camera sees zero faces for > 5 consecutive seconds. |
| `FACE_ABSENT_EXTENDED`| `DANGER` | Primary camera sees zero faces for > 15 consecutive seconds. |
| `MULTIPLE_FACES_DETECTED`| `DANGER` | Two or more distinct faces identified in primary or secondary feed. |
| `GAZE_DIVERGENCE_PROLONGED`| `WARNING` | Eye gaze and head pose turned away from screen bounds for > 6s. |
| `SECONDARY_CAM_DISCONNECTED`| `DANGER` | WebRTC mobile stream stopped emitting video frames. |
| `SECONDARY_CAM_OCCLUDED` | `WARNING` | Secondary camera feed brightness is near-zero or obstructed. |
| `MULTIPLE_VOICES_DETECTED` | `WARNING` | Secondary distinct vocal formant detected while candidate is quiet. |
| `AUDIO_MUTED_OR_LOST` | `WARNING` | Microphone hardware disconnected or audio signal drops to 0 RMS. |

### 3.2 Incident Payload Envelope (`PROCTORING_INCIDENT`)

Emitted via WebSocket and persisted into the audit database:
```json
{
  "event": "PROCTORING_INCIDENT",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "server",
  "timestamp": 1792887520400,
  "data": {
    "incident_id": "inc_01HZX942A8K",
    "event_type": "MULTIPLE_FACES_DETECTED",
    "severity": "DANGER",
    "feed_source": "PRIMARY_CAMERA",
    "confidence_score": 0.962,
    "duration_ms": 3200,
    "relative_interview_offset_ms": 115280,
    "associated_question_id": "q_04",
    "bounding_boxes": [
      {
        "entity": "candidate_face",
        "box": { "top": 0.18, "left": 0.35, "width": 0.28, "height": 0.42 }
      },
      {
        "entity": "secondary_face",
        "box": { "top": 0.12, "left": 0.05, "width": 0.22, "height": 0.35 }
      }
    ],
    "evidence_snapshot_url": "https://storage.proctra.ai/evidence/intv_92b8d4e1/inc_01HZX942A8K.jpg",
    "metadata": {
      "detection_model": "yolov8n-face-onnx",
      "inference_latency_ms": 28
    }
  }
}
```

### 3.3 Heartbeat & Peripheral Status Payload

Emitted every 3 seconds from active candidate feeds to detect network and peripheral dropouts.
```json
{
  "event": "STREAM_HEARTBEAT",
  "session_id": "intv_92b8d4e1-7ca2-4e4b-b0b9-fa684d0b115e",
  "sender_role": "primary_web",
  "timestamp": 1792887523000,
  "data": {
    "primary_video_ok": true,
    "primary_audio_ok": true,
    "secondary_video_ok": true,
    "avg_fps": 29.8,
    "audio_rms_level": -24.2,
    "client_rtt_ms": 42
  }
}
```