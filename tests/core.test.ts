import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_UPLOAD_GRANULARITY,
  UPLOAD_CHUNK_SIZE,
  computeChunkRanges,
  formatSeconds,
  normalizeAudioMimeType,
  parseTimestampToSeconds,
} from "../src/lib/mime.ts";
import { buildMindMapTree, computeTreeLayout, wrapThaiText } from "../src/lib/mindmap-builder.ts";
import { formatForLineChat, formatTasksAsCsv } from "../src/lib/export-utils.ts";
import {
  DEFAULT_MODEL_CANDIDATES,
  GEMINI_RESPONSE_SCHEMA,
  selectBestFallbackModels,
} from "../src/lib/gemini-server.ts";
import { hitTestStroke } from "../src/lib/media-utils.ts";
import {
  createNotebookFromMeeting,
  mergeNotebook,
  strokePointsToSvgPath,
} from "../src/lib/notebook-crdt.ts";
import type { SavedMeeting } from "../src/types/meeting.ts";
import type { ShootNotebook } from "../src/types/notebook.ts";

test("normalizeAudioMimeType strips codecs and normalizes browser/device audio formats", () => {
  assert.equal(
    normalizeAudioMimeType("voice.webm", "audio/webm;codecs=opus"),
    "audio/webm"
  );
  assert.equal(
    normalizeAudioMimeType("iphone-memo.m4a", "audio/x-m4a"),
    "audio/mp4"
  );
  assert.equal(
    normalizeAudioMimeType("record.mp3", "application/octet-stream"),
    "audio/mpeg"
  );
  assert.equal(
    normalizeAudioMimeType("meeting.mp4", ""),
    "video/mp4"
  );
  assert.equal(
    normalizeAudioMimeType("audio.wav", "audio/x-wav"),
    "audio/wav"
  );
});

test("computeChunkRanges aligns all non-final chunks to 8 MiB granularity", () => {
  assert.equal(GOOGLE_UPLOAD_GRANULARITY, 8 * 1024 * 1024);
  assert.equal(UPLOAD_CHUNK_SIZE % GOOGLE_UPLOAD_GRANULARITY, 0);

  const small = computeChunkRanges(500_000);
  assert.equal(small.length, 1);
  assert.deepEqual(small[0], {
    index: 0,
    start: 0,
    end: 500_000,
    size: 500_000,
    isFinal: true,
  });

  const largeBytes = 19 * 1024 * 1024 + 123;
  const multi = computeChunkRanges(largeBytes);
  assert.equal(multi.length, 3);
  assert.equal(multi[0].isFinal, false);
  assert.equal(multi[0].size, 8 * 1024 * 1024);
  assert.equal(multi[0].size % GOOGLE_UPLOAD_GRANULARITY, 0);
  assert.equal(multi[1].isFinal, false);
  assert.equal(multi[1].size, 8 * 1024 * 1024);
  assert.equal(multi[1].size % GOOGLE_UPLOAD_GRANULARITY, 0);
  assert.equal(multi[2].isFinal, true);
  assert.equal(multi[2].size, 3 * 1024 * 1024 + 123);
  assert.equal(multi[2].end, largeBytes);
});

test("GEMINI_RESPONSE_SCHEMA uses strictly UPPERCASE REST OpenAPI types", () => {
  const ALLOWED_TYPES = new Set([
    "OBJECT",
    "ARRAY",
    "STRING",
    "NUMBER",
    "INTEGER",
    "BOOLEAN",
  ]);
  let checkedCount = 0;

  function assertUpperTypes(node: unknown, path: string) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => assertUpperTypes(item, `${path}[${idx}]`));
      return;
    }
    const obj = node as Record<string, unknown>;
    if ("type" in obj) {
      checkedCount += 1;
      assert.ok(
        typeof obj.type === "string" && ALLOWED_TYPES.has(obj.type),
        `Invalid type "${String(obj.type)}" at ${path}`
      );
    }
    for (const [key, val] of Object.entries(obj)) {
      if (key !== "type") {
        assertUpperTypes(val, `${path}.${key}`);
      }
    }
  }

  assertUpperTypes(GEMINI_RESPONSE_SCHEMA, "GEMINI_RESPONSE_SCHEMA");
  assert.ok(checkedCount > 15);
});

test("timestamp parsing and formatting round-trip cleanly", () => {
  assert.equal(parseTimestampToSeconds("05:12"), 312);
  assert.equal(parseTimestampToSeconds("[01:02:03]"), 3723);
  assert.equal(parseTimestampToSeconds("invalid"), 0);
  assert.equal(formatSeconds(312), "05:12");
  assert.equal(formatSeconds(3723), "01:02:03");
});

test("MindMap builder and tree layout keep Thai text intact and avoid overlapping boxes", () => {
  const lines = wrapThaiText(
    "ประชุมวางแผนเปิดตัวระบบสมาชิกสะสมแต้มไตรมาสที่สี่สำหรับสาขานำร่อง",
    20,
    4
  );
  assert.ok(lines.length >= 2 && lines.length <= 4);

  const tree = buildMindMapTree({
    meetingTitle: "ประชุมสรุปแผนงาน",
    topics: [
      {
        id: "t1",
        title: "การตลาด",
        startTime: "00:00",
        endTime: "05:00",
        summary: "เตรียมสื่อหน้าร้าน",
        keyPoints: ["ทำป้าย QR Code"],
        decisions: ["อนุมัติงบ 18,500 บาท"],
        colorIndex: 0,
      },
      {
        id: "t2",
        title: "ระบบหลังบ้าน",
        startTime: "05:01",
        endTime: "10:00",
        summary: "ทดสอบความเร็ว",
        keyPoints: ["แก้หน้าโปรไฟล์ iOS"],
        decisions: [],
        colorIndex: 1,
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "ส่งแบบพิมพ์ QR Code",
        assignee: "พลอย",
        dueDate: "พุธนี้",
        priority: "high",
        status: "todo",
        topicId: "t1",
      },
    ],
  });

  const expanded = computeTreeLayout(tree, new Set(), true);
  assert.ok(expanded.nodes.length >= 6);
  assert.equal(expanded.edges.length, expanded.nodes.length - 1);

  // Verify no two nodes overlap
  for (let i = 0; i < expanded.nodes.length; i += 1) {
    for (let j = i + 1; j < expanded.nodes.length; j += 1) {
      const a = expanded.nodes[i];
      const b = expanded.nodes[j];
      const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
      const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
      assert.equal(overlapX && overlapY, false, `Nodes ${a.id} and ${b.id} overlap`);
    }
  }

  // Verify collapsing root hides children
  const collapsedRoot = computeTreeLayout(tree, new Set(["root"]), true);
  assert.equal(collapsedRoot.nodes.length, 1);
  assert.equal(collapsedRoot.edges.length, 0);

  // Verify excluding tasks hides task nodes
  const withoutTasks = computeTreeLayout(tree, new Set(), false);
  assert.equal(
    withoutTasks.nodes.some((n) => n.nodeType === "task"),
    false
  );
});

test("export utils prepend UTF-8 BOM for CSV and format LINE summary cleanly", () => {
  const sample: SavedMeeting = {
    id: "m1",
    createdAt: Date.UTC(2026, 10, 25, 10, 0, 0),
    updatedAt: Date.UTC(2026, 10, 25, 10, 0, 0),
    sourceType: "upload",
    fileName: "sync.m4a",
    hasLocalAudio: false,
    analysis: {
      meetingTitle: "ประชุมทีมสินค้า",
      executiveSummary: "สรุปแผนปล่อยฟีเจอร์ใหม่",
      participants: ["พลอย", "ต้น"],
      keyDecisions: ["ปล่อยเวอร์ชันแรกวันศุกร์"],
      blockers: [],
      topics: [
        {
          id: "t1",
          title: "ฟีเจอร์ใหม่",
          startTime: "00:00",
          endTime: "04:00",
          summary: "ตรวจสอบ UX",
          keyPoints: ["ปรับปุ่มสั่งซื้อ"],
          decisions: ["ใช้สีเขียวเข้ม"],
          colorIndex: 0,
        },
      ],
      tasks: [
        {
          id: "k1",
          title: 'แก้ข้อความ "ยืนยัน, ชำระเงิน"',
          description: "ตรวจคำสะกด",
          assignee: "ต้น",
          dueDate: "พรุ่งนี้",
          priority: "high",
          status: "todo",
          topicId: "t1",
        },
      ],
      transcript: [],
      mindMap: {
        id: "root",
        label: "ประชุมทีมสินค้า",
        nodeType: "root",
        children: [],
      },
    },
  };

  const csv = formatTasksAsCsv(sample);
  assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM");
  assert.ok(csv.includes('""ยืนยัน, ชำระเงิน""'), "CSV must escape quotes and commas");

  const lineTxt = formatForLineChat(sample);
  assert.ok(lineTxt.includes("ประชุมทีมสินค้า"));
  assert.ok(lineTxt.includes("ปล่อยเวอร์ชันแรกวันศุกร์"));
  assert.ok(lineTxt.includes("ฟีเจอร์ใหม่"));
});

test("DEFAULT_MODEL_CANDIDATES starts with gemini-3.8-flash and selectBestFallbackModels filters & ranks properly", () => {
  assert.equal(DEFAULT_MODEL_CANDIDATES[0], "gemini-3.8-flash");

  const picked = selectBestFallbackModels(
    [
      {
        name: "models/gemini-2.5-flash-tts",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-embedding-001",
        supportedGenerationMethods: ["embedContent"],
      },
      {
        name: "models/imagen-4.0-generate-001",
        supportedGenerationMethods: ["predict"],
      },
      {
        name: "models/gemini-3.8-flash",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.5-flash",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.8-flash-lite",
        supportedGenerationMethods: ["generateContent"],
      },
      {
        name: "models/gemini-3.8-pro",
        supportedGenerationMethods: ["generateContent"],
      },
    ],
    new Set(["gemini-3.8-flash"])
  );

  assert.deepEqual(picked, [
    "gemini-3.5-flash",
    "gemini-3.8-flash-lite",
    "gemini-3.8-pro",
  ]);
});

test("mergeNotebook merges concurrent strokes, sticky edits, tombstones, and max pageHeight", () => {
  const base: ShootNotebook = {
    id: "nb-1",
    kind: "notebook",
    title: "เดิม",
    paperTemplate: "lined",
    pageHeight: 1600,
    strokes: [
      {
        id: "s1",
        tool: "pen",
        color: "#000000",
        size: 5,
        opacity: 1,
        isStylus: true,
        points: [
          [10, 10, 0.5],
          [50, 50, 0.6],
        ],
        updatedAt: 100,
      },
    ],
    items: [
      {
        id: "i1",
        type: "sticky",
        x: 20,
        y: 20,
        width: 200,
        height: 150,
        zIndex: 1,
        text: "ข้อความเดิม",
        updatedAt: 100,
      },
    ],
    metaUpdatedAt: 100,
    createdAt: 100,
    updatedAt: 100,
  };

  const remote: ShootNotebook = {
    ...base,
    title: "สมุดแชร์ล่าสุด",
    paperTemplate: "grid",
    pageHeight: 2600,
    metaUpdatedAt: 250,
    strokes: [
      { ...base.strokes[0], deleted: true, updatedAt: 220 },
      {
        id: "s2",
        tool: "highlighter",
        color: "#FEF08A",
        size: 20,
        opacity: 0.36,
        isStylus: false,
        points: [
          [100, 100, 0.5],
          [200, 100, 0.5],
        ],
        updatedAt: 230,
      },
    ],
    items: [
      { ...base.items[0], text: "ข้อความที่เพื่อนแก้", updatedAt: 240 },
    ],
  };

  const merged = mergeNotebook(base, remote);
  assert.equal(merged.title, "สมุดแชร์ล่าสุด");
  assert.equal(merged.paperTemplate, "grid");
  assert.equal(merged.pageHeight, 2600);
  assert.equal(merged.strokes.length, 2);
  assert.equal(merged.strokes.find((s) => s.id === "s1")?.deleted, true);
  assert.equal(merged.items[0].text, "ข้อความที่เพื่อนแก้");
});

test("hitTestStroke detects eraser touch near stroke segments", () => {
  const stroke = {
    id: "s1",
    tool: "pen" as const,
    color: "#1C1B18",
    size: 6,
    opacity: 1,
    isStylus: true,
    points: [
      [100, 100, 0.5] as [number, number, number],
      [200, 100, 0.5] as [number, number, number],
    ],
    updatedAt: 100,
  };

  assert.equal(hitTestStroke(stroke, 150, 106, 12), true);
  assert.equal(hitTestStroke(stroke, 150, 160, 12), false);
});

test("strokePointsToSvgPath generates closed SVG path using perfect-freehand", () => {
  const path = strokePointsToSvgPath(
    [
      [10, 10, 0.3],
      [40, 25, 0.6],
      [80, 40, 0.8],
    ],
    { size: 8, tool: "pen", isStylus: true }
  );
  assert.ok(path.startsWith("M "));
  assert.ok(path.endsWith(" Z"));
});

test("createNotebookFromMeeting creates non-overlapping meeting cards ready for annotation", () => {
  const meeting: SavedMeeting = {
    id: "m-test",
    createdAt: 1000,
    updatedAt: 1000,
    sourceType: "demo",
    fileName: "demo.m4a",
    hasLocalAudio: false,
    analysis: {
      meetingTitle: "ประชุมสรุปงาน Q4",
      executiveSummary: "เห็นชอบเปิดตัวระบบใหม่",
      participants: ["พลอย", "ต้น"],
      keyDecisions: ["เปิดใช้ 1 ธ.ค."],
      blockers: [],
      topics: [
        {
          id: "t1",
          title: "การตลาด",
          startTime: "00:00",
          endTime: "05:00",
          summary: "เตรียมป้าย QR",
          keyPoints: ["ส่งโรงพิมพ์"],
          decisions: ["อนุมัติงบ"],
          colorIndex: 0,
        },
        {
          id: "t2",
          title: "ระบบหลังบ้าน",
          startTime: "05:01",
          endTime: "10:00",
          summary: "ทดสอบโหลด",
          keyPoints: ["Load test"],
          decisions: [],
          colorIndex: 1,
        },
      ],
      tasks: [
        {
          id: "k1",
          title: "ส่งไฟล์พิมพ์",
          assignee: "พลอย",
          dueDate: "พุธนี้",
          priority: "high",
          status: "todo",
          topicId: "t1",
        },
      ],
      transcript: [],
      mindMap: { id: "root", label: "ประชุม", nodeType: "root", children: [] },
    },
  };

  const nb = createNotebookFromMeeting(meeting);
  assert.equal(nb.title, "ประชุมสรุปงาน Q4");
  assert.ok(nb.items.length >= 4);
  for (let i = 0; i < nb.items.length; i += 1) {
    for (let j = i + 1; j < nb.items.length; j += 1) {
      const a = nb.items[i];
      const b = nb.items[j];
      const ox = a.x < b.x + b.width && a.x + a.width > b.x;
      const oy = a.y < b.y + b.height && a.y + a.height > b.y;
      assert.equal(ox && oy, false, `Items ${a.id} and ${b.id} overlap`);
    }
  }
});
