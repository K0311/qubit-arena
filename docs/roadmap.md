# Qubit Arena — Roadmap จนจบโปรเจกต์

ไฟล์นี้เป็น **แผนงานหลักตั้งแต่ตอนนี้จนส่งงานเดือนเมษายน 2027** ทุกงานเป็น checkbox ผูกกับ prompt ใน
[claude-code-prompts.md](claude-code-prompts.md)

**วิธีใช้กับ Claude Code**
- พิมพ์ `/next` → Claude จะหางานแรกที่ยังไม่ติ๊ก ทำตาม prompt ของงานนั้น รัน test แล้วติ๊ก `[x]` ในไฟล์นี้ และเปิด PR ให้
- พิมพ์ `/status` → สรุปว่าทำถึงไหน ตามแผนหรือช้ากว่าแผน และงานถัดไปคืออะไร
- งานที่มี 👤 ต้องให้คนทำหรือตัดสินใจเอง Claude จะหยุดแล้วถามก่อน

> วันที่เป็นเป้าหมาย ถ้าช้ากว่าแผนเกิน 1 สัปดาห์ ให้ตัดงานในเฟส 6 (ฟีเจอร์เสริม) ก่อน ห้ามตัดงานในเฟส 7–9

---

## ภาพรวม

| เฟส | งาน | ช่วงเวลา | ขั้น (Game dev process) |
|---|---|---|---|
| 0 | ตั้งโครง monorepo + CI | 11–17 พ.ย. 2026 | Production |
| 1 | Engine: คณิตควอนตัม | 18 พ.ย. – 1 ธ.ค. | Production |
| 2 | Engine: ตัวเกม + simulation | 2–15 ธ.ค. | Production ↔ Testing |
| 3 | Server ออนไลน์ | 16 ธ.ค. – 10 ม.ค. 2027 | Production ↔ Testing |
| 4 | Client 2D เล่นได้จนจบ | 11–31 ม.ค. | Production ↔ Testing |
| 5 | 3D + tutorial → **feature freeze 15 ก.พ.** | 1–15 ก.พ. | Production |
| 6 | ฟีเจอร์เสริม (บัญชี, ranking, เสียง) — ตัดได้ | 16 ก.พ. – 10 มี.ค. | Production |
| 7 | Testing + deploy beta + user study | 16 ก.พ. – 20 มี.ค. | Testing |
| 8 | Deploy final + เขียนรายงาน | 1 มี.ค. – 10 เม.ย. | Report & final |
| 9 | Final presentation + ส่งมอบ | เม.ย. 2027 (วันสอบตามคณะ) | Report & final |

---

## เฟส 0 — ตั้งโครง (11–17 พ.ย.)

- [x] P-0.1 Scaffold monorepo (pnpm, TS strict, Vitest, ESLint/Prettier)
- [x] P-0.2 GitHub Actions CI
- [x] 👤 ตั้ง branch protection ให้ `main` (Settings → Branches → require PR + CI)
- [x] 👤 ใส่ชื่อสมาชิกในตาราง Team roles (`docs/project-overview.md` §7)

**ผ่านเมื่อ:** `pnpm test` / `pnpm typecheck` ผ่าน, CI เขียว

## เฟส 1 — Engine คณิตควอนตัม (18 พ.ย. – 1 ธ.ค.)

- [x] P-1.1 Complex + matrix
- [x] P-1.2 Gates + 42 gate tests (T-G-01..46)
- [x] P-1.3 Two-qubit state, CNOT, Measure, fog (T-C-01..10)
- [x] P-1.4 Board lines generator

**ผ่านเมื่อ:** T-G และ T-C ผ่านทั้งหมด, coverage engine ≥ 90 %

## เฟส 2 — Engine ตัวเกม (2–15 ธ.ค.)

- [x] P-2.1 Deck, opening roll, kickoff (T-R-01..04b, T-R-24)
- [x] P-2.2 Turns, scoring, game end (T-R-05..19, T-R-23)
- [x] P-2.3 Quantum Challenge (T-R-20..22)
- [x] P-2.4 Filtered view, bot, simulation 10,000 เกม

**ผ่านเมื่อ:** T-R ผ่านทั้งหมด, `pnpm sim` 10,000 เกมไม่พัง

## เฟส 3 — Server (16 ธ.ค. – 10 ม.ค.)

- [x] P-3.1 Protocol (zod)
- [x] P-3.2 Server core: rooms, lobby, filtered views, chat (T-S-01..05, 08)
- [x] P-3.3 Clocks, reconnection, bot seats, rate limit (T-S-06, 07, 09)
- [x] P-3.4 Hidden data audit (T-S-03 กับ 50 เกม)

**ผ่านเมื่อ:** T-S ผ่านทั้งหมด

## เฟส 4 — Client 2D (11–31 ม.ค.)

- [ ] P-4.1 App shell + theme tokens + menu/lobby/room + WebSocket + store (ตาม `docs/ui-spec.md`)
- [ ] P-4.2 Game screen: 2D board + gate cards + hand + preview + action log
- [ ] P-4.3 State panel + team chat + Quantum Challenge + Result + Settings
- [ ] P-4.4 Playwright T-E-01..05
- [ ] 👤 ทีมเล่นทดสอบกันเอง 3 เกม (Solo 1, Team 2) จดสิ่งที่งงลง GitHub Issues

**ผ่านเมื่อ:** เล่น Solo และ Team ผ่านเบราว์เซอร์จนจบเกมได้ และหน้าจอตรงกับ `docs/ui-spec.md`

## เฟส 5 — 3D + tutorial (1–15 ก.พ.) → Feature freeze

- [ ] P-5.1 3D board
- [ ] P-5.2 Bloch spheres + animation
- [ ] P-5.3 Tutorial 5 บท + T-E-06
- [ ] P-7.0 Feature freeze checklist (ดู claude-code-prompts.md)

**ผ่านเมื่อ:** ฟีเจอร์ MVP ครบตาม `docs/project-overview.md` §4

## เฟส 6 — ฟีเจอร์เสริม (ตัดได้ถ้าเวลาไม่พอ)

- [ ] P-6.1 บัญชี + match history + ranking
- [ ] P-6.3 เสียง (optional)
- [ ] P-6.4 Greedy bot

## เฟส 7 — Testing + user study (16 ก.พ. – 20 มี.ค.)

- [ ] P-6.2 Docker Compose + deploy **beta** (ต้องมี URL ให้ผู้ทดสอบเข้าได้)
- [ ] P-7.1 Full system test run + test report (SE-1..SE-6)
- [ ] P-7.2 Online soak test (4 ผู้เล่นจริง/บอท 2 ชั่วโมง)
- [ ] P-7.3 Learning check + survey pages ในเกม (ตาม `docs/user-study.md`)
- [ ] P-7.4 Export ผลการศึกษาเป็น CSV
- [x] 👤 ขออนุมัติจากอาจารย์ที่ปรึกษาก่อนเก็บข้อมูลผู้ใช้ (และ ethics ถ้าคณะกำหนด)
- [ ] 👤 รับสมัครผู้เข้าร่วม (เป้าหมาย ≥ 20 คน) และจัด session
- [ ] P-7.5 วิเคราะห์ผล user study → `docs/report/user-study-results.md`
- [ ] P-7.6 แก้บั๊กและปรับสมดุลจากผลทดสอบ (สร้าง issue ทีละเรื่อง)

**ผ่านเมื่อ:** มี test report + ผล user study ครบ

## เฟส 8 — Deploy final + รายงาน (1 มี.ค. – 10 เม.ย.)

- [ ] P-8.1 Deploy **final** + README วิธีรันด้วยคำสั่งเดียว
- [ ] P-8.2 Release v1.0 (tag + CHANGELOG)
- [ ] P-8.3 เก็บภาพหน้าจอและวิดีโอเดโมด้วย Playwright
- [ ] P-8.4 ร่าง Chapter 4 Implementation → `docs/report/ch4-implementation.md`
- [ ] P-8.5 ร่าง Chapter 5 Evaluation & Results → `docs/report/ch5-evaluation.md`
- [ ] P-8.6 ร่าง Chapter 6 Conclusion & Future work → `docs/report/ch6-conclusion.md`
- [ ] P-8.7 ร่าง AI Usage Acknowledgment + Appendix (user manual, test list)
- [ ] 👤 ย้ายร่างจาก `docs/report/` ลง Google Doc รายงาน (หรือให้ Claude ในแชตช่วย) ใส่ Figure ที่ค้าง อัปเดตสารบัญ
- [ ] 👤 อาจารย์ที่ปรึกษาตรวจร่างรายงาน แล้วแก้ตามคอมเมนต์

## เฟส 9 — Final presentation + ส่งมอบ (เม.ย.)

- [ ] P-9.1 Demo script + seed สำหรับเดโมที่ผลแน่นอน
- [ ] P-9.2 Final slide content → `docs/report/final-slides.md`
- [ ] 👤 อัปเดต Canva: ขั้น Testing เสร็จ, ใส่ผลทดสอบ, ภาพเกมจริง
- [ ] P-9.3 Handover check: repo สะอาด, docs ครบ, CI เขียว, URL ใช้ได้
- [ ] 👤 ซ้อมพรีเซนต์ + เดโมสด (มีวิดีโอสำรอง)
- [ ] 👤 ส่งรายงาน + repo + URL + วิดีโอ

---

## บันทึกความคืบหน้า

| วันที่ | สิ่งที่เสร็จ | หมายเหตุ |
|---|---|---|
| 10 พ.ย. 2026 | Proposal, spec, rules, test plan, prompts | เข้าเฟส Implementation |
| 11 พ.ย. 2026 | ใส่ชื่อบทบาททีม | engine: Bunyakorn · server: Ayumu · client: Kittiyakarn |
| 11 พ.ย. 2026 | เฟส 0 ครบ (P-0.1, P-0.2) | PR #1: monorepo + CI · branch protection ของ `main` (ต้องมี PR + approve 1 คน) |
| 11 พ.ย. 2026 | เฟส 1 ครบ (P-1.1 – P-1.4) | PR #2: T-G-01..46, T-C-01..10 ผ่าน, coverage engine 99 % lines |
| 11 พ.ย. 2026 | เฟส 2 ครบ (P-2.1 – P-2.4) | PR #3: T-R-01..24 ผ่าน, coverage engine 98.8 % lines, `pnpm sim` 10,000 เกมผ่าน (~6 วินาที) · เร็วกว่าแผนประมาณ 5 สัปดาห์ |
| 11 พ.ย. 2026 | ธีมอวกาศ + กระดานแบบ Blender | PR #4: `docs/visual-design.md`, `boardPoint()`, `boardEdges()` |
| 11 พ.ย. 2026 | อาจารย์อนุมัติ user study | ไม่ต้องขออนุมัติเพิ่มก่อนเก็บข้อมูลในเฟส 7 |
| 11 พ.ย. 2026 | P-3.1 Protocol | `packages/protocol`: zod schema ทุกข้อความ + `READY`, `WELCOME`; ตรวจกับเกมจริงจาก engine ทุก view และ event |
| 11 พ.ย. 2026 | P-3.2 Server core | `apps/server`: WebSocket (`ws`), ห้อง public/private/quick match, ที่นั่ง, ready, เริ่มเกม, view แยกต่อคน, chat เฉพาะทีม, ผู้ชม; T-S-01..05, 08 ผ่าน |
| 12 พ.ย. 2026 | P-3.3 Clocks, reconnection, bots | turn timer 60 วิ + นาฬิกาเกมบน server, กลับเข้าเกมด้วย token, bot เล่นแทนที่นั่งที่หลุดเกิน 30 วิ, rate limit chat/ข้อความ; T-S-06, 07, 09 ผ่าน |
| 12 พ.ย. 2026 | P-3.4 Hidden data audit | T-S-03 ตรวจทุกข้อความขาออกใน 50 เกม (Solo/Team, ผู้ชม, bot, timeout, Quantum Challenge) ไม่มีกองไพ่ seed ไพ่ฝ่ายตรงข้าม หรือคำถามถัดไปหลุด; ปิดห้องที่จบแล้วเมื่อไม่มีใครอยู่; เพิ่ม `pnpm --filter @qa/server cli` ให้ 2 terminal เล่นกันได้ — เฟส 3 ครบ |
| 11 พ.ย. 2026 | UI spec + ภาพ reference | `docs/ui-spec.md` (หน้าจอ, HUD, การ์ด) + `docs/visual-design.md` (กระดาน); เอาแค่ UI ไม่เปลี่ยนกฎ |
