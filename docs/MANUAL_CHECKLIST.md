# Manual checklist (things automation here can't prove)

Automated runs use snap Chromium/Brave headless on Linux with a synthetic face video and scripted
voice clips. These checks need a person, real hardware or Google Chrome. Tick each item on the
deployed URL (`https://proctra-two.vercel.app`) unless it says local.

## Candidate, Chrome on a laptop with real speakers and mic
- [ ] Sound check plays the **browser voice** (Chrome has voices; snap browsers report none, so this path is only unit-tested with a mocked `speechSynthesis`).
- [ ] With headphones: the echo test passes. Without them, it reports echo and suggests headphones.
- [ ] A spoken answer is transcribed live (Web Speech). Say "can you repeat" mid-question: the question restarts.
- [ ] Talk over the interviewer: it stops within about 1 s ("Go ahead…") and resumes the question afterwards.
- [ ] After an answer ends, the interviewer starts speaking within about 2 s of the 5 s silence countdown finishing (browser voice or Orpheus).
- [ ] Block `/api/candidate/tts` in DevTools (Network → Block request URL) mid-interview. Speech continues on the on-device voice with no error shown.
- [ ] Turn off Wi-Fi for 10 s mid-answer, then turn it back on. "Reconnecting…" appears, then the interview continues.
- [ ] Press Esc (leave fullscreen), switch tabs and stop screen sharing. Each one shows a calm reminder at most once per 30 s, and the interview pauses when screen sharing stops.

## Phone camera (same Wi-Fi; TURN is pending)
- [ ] Scan the QR with a real phone, allow the camera and confirm "Phone connected" on the laptop.
- [ ] Lock the phone. The laptop shows the phone-disconnected reminder, and the review shows the gap in the phone stream.
- [ ] On mobile data (a different network) pairing is expected to **fail** until TURN is configured. Confirm the candidate can still continue without the phone.

## Recruiter review (`/dashboard/interviews/:id`)
- [ ] Header: candidate, job, date, duration excluding pauses, engines used, headphone/echo result, evaluation status.
- [ ] Scores tab: per-question cards; clicking a highlighted quote jumps the recording to that moment.
- [ ] Recording tab: camera, screen and phone play in sync. Clicking a marker seeks all three, and pauses show as shaded spans.
- [ ] Proctoring tab: thumbnails load. After 5 minutes, a reload is needed to view them again (signed URLs expire).
- [ ] Override a score with a reason: the AI score stays visible and the history lists who changed it, when and why.
- [ ] Advance / Hold / Reject plus notes persist after a reload. No AI recommendation appears anywhere.
- [ ] "Re-run evaluation" changes the status PENDING → RUNNING → DONE without a page reload.
- [ ] "Download PDF" (print) shows every tab's content with no video elements. The CSV opens in a spreadsheet.
- [ ] Sign in as the candidate: the dashboard only says "Completed — the hiring team will be in touch".

## Not covered at all in this prototype
- TURN relay (phone on a different network), Safari/Firefox, mobile candidate devices, and very long (> 45 min) interviews.
