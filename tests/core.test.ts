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
  attachNotebookToRoom,
  createEmptyNotebook,
  createGuestRoomNotebook,
  createMeetingPageItems,
  createNotebookFromMeeting,
  createNotebookPage,
  ensureNotebookPages,
  mergeNotebook,
  strokePointsToSvgPath,
} from "../src/lib/notebook-crdt.ts";
import { recognizeHeldShape } from "../src/lib/shape-recognizer.ts";
import { evaluateScientificMath } from "../src/lib/math-engine.ts";
import {
  detectLinkProvider,
  parseYouTubeUrl,
} from "../src/lib/link-utils.ts";
import {
  decodeMqttPackets,
  decodeRemainingLength,
  encodeMqttConnect,
  encodeMqttPublish,
  encodeMqttSubscribe,
  encodeRemainingLength,
} from "../src/lib/mqtt-ws.ts";
import {
  UPDATE_SNOOZE_MS,
  shouldPromptAppUpdate,
} from "../src/lib/app-version.ts";
import {
  canMoveFolderInto,
  countNotebooksInFolder,
  createFolder,
  getFolderBreadcrumbs,
  moveNotebookToFolder,
  removeFolderAndUnfileNotebooks,
} from "../src/lib/folder-utils.ts";
import {
  applyPartialEraseAlongSegment,
  eraseStrokePartially,
} from "../src/lib/eraser-utils.ts";
import {
  getDimensionsForPaperSize,
  resolvePageDimensions,
} from "../src/lib/paper-utils.ts";
import { getShapeSvgPath } from "../src/lib/shape-svg.ts";
import type { SavedMeeting } from "../src/types/meeting.ts";
import {
  SHAPE_CATALOG,
  type InkStroke,
  type NotebookFolder,
  type ShootNotebook,
} from "../src/types/notebook.ts";

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
  assert.equal(nb.pages?.length, 2);
  assert.ok(nb.items.length >= 4);
  assert.ok(nb.items.every((item) => item.pageId === "page-1"));
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

test("ensureNotebookPages upgrades legacy single-page notebooks and mergeNotebook syncs multi-page changes", () => {
  const legacy: ShootNotebook = {
    id: "legacy-1",
    kind: "notebook",
    title: "สมุดเดิม",
    paperTemplate: "grid",
    pageHeight: 1800,
    strokes: [],
    items: [],
    metaUpdatedAt: 100,
    createdAt: 100,
    updatedAt: 100,
  };

  const pages = ensureNotebookPages(legacy);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].id, "page-1");
  assert.equal(pages[0].paperTemplate, "grid");
  assert.equal(pages[0].pageHeight, 1800);

  const page2 = createNotebookPage(1, "dark_grid", 1600, "page-2");
  const page3 = createNotebookPage(2, "dark_lined", 1600, "page-3");

  const localWithP2: ShootNotebook = {
    ...legacy,
    pages: [...pages, page2],
  };
  const remoteWithP3AndDeletedP2: ShootNotebook = {
    ...legacy,
    pages: [
      pages[0],
      { ...page2, deleted: true, updatedAt: page2.updatedAt + 50 },
      page3,
    ],
  };

  const merged = mergeNotebook(localWithP2, remoteWithP3AndDeletedP2);
  const visible = ensureNotebookPages(merged);
  assert.deepEqual(
    visible.map((p) => p.id),
    ["page-1", "page-3"]
  );
  assert.equal(visible[1].paperTemplate, "dark_lined");
});

test("mqtt-ws encodes and decodes MQTT 3.1.1 packets, Thai UTF-8, multi-byte lengths, and split frames", () => {
  const smallRem = encodeRemainingLength(127);
  assert.deepEqual(smallRem, [127]);
  const bigRem = encodeRemainingLength(17_500);
  assert.equal(
    decodeRemainingLength(Uint8Array.from(bigRem), 0)?.value,
    17_500
  );

  const connectPkt = encodeMqttConnect("shootnote-client-1", 25);
  assert.equal(connectPkt[0], 0x10);
  const subPkt = encodeMqttSubscribe(7, "shootnote/v2/SN-ABC123");
  assert.equal(subPkt[0], 0x82);

  // Build synthetic CONNACK + Thai PUBLISH (> 250 bytes) + 17,500-byte large PUBLISH + QoS1 PUBLISH
  const connack = Uint8Array.from([0x20, 0x02, 0x00, 0x00]);
  const thaiPayload = JSON.stringify({
    kind: "delta",
    title: "สรุปการประชุมทดลองซิงก์สดภาษาไทย ".repeat(6),
  });
  const pubThai = encodeMqttPublish("shootnote/v2/SN-ABC123", thaiPayload);
  const hugePayload = "ก".repeat(6000); // > 18,000 UTF-8 bytes
  const pubHuge = encodeMqttPublish("shootnote/v2/SN-ABC123", hugePayload);

  // Merge buffers and split in the middle of pubHuge to test partial buffer handling
  const stream = new Uint8Array(connack.length + pubThai.length + pubHuge.length);
  stream.set(connack, 0);
  stream.set(pubThai, connack.length);
  stream.set(pubHuge, connack.length + pubThai.length);

  const cut = connack.length + pubThai.length + 500;
  const firstChunk = decodeMqttPackets(stream.subarray(0, cut));
  assert.equal(firstChunk.packets.length, 2);
  assert.deepEqual(firstChunk.packets[0], { type: "connack", returnCode: 0 });
  assert.equal(firstChunk.packets[1].type, "publish");
  if (firstChunk.packets[1].type === "publish") {
    assert.equal(firstChunk.packets[1].topic, "shootnote/v2/SN-ABC123");
    assert.equal(firstChunk.packets[1].payload, thaiPayload);
  }
  assert.equal(firstChunk.remaining.length, 500);

  const combinedSecond = new Uint8Array(
    firstChunk.remaining.length + (stream.length - cut)
  );
  combinedSecond.set(firstChunk.remaining, 0);
  combinedSecond.set(stream.subarray(cut), firstChunk.remaining.length);

  const secondChunk = decodeMqttPackets(combinedSecond);
  assert.equal(secondChunk.packets.length, 1);
  assert.equal(secondChunk.remaining.length, 0);
  if (secondChunk.packets[0].type === "publish") {
    assert.equal(secondChunk.packets[0].payload, hugePayload);
  }
});

test("createGuestRoomNotebook cleanly adopts older host notebook metadata, pages, strokes, and items on join", () => {
  const olderHostTime = 1_700_000_000_000;
  const host: ShootNotebook = {
    id: "host-nb-1",
    kind: "notebook",
    title: "สมุดจดจริงของโฮสต์",
    paperTemplate: "dark_grid",
    pageHeight: 2200,
    pages: [
      {
        id: "page-1",
        paperTemplate: "dark_grid",
        pageHeight: 2200,
        order: 0,
        updatedAt: olderHostTime,
      },
      {
        id: "page-2",
        paperTemplate: "cornell",
        pageHeight: 1600,
        order: 1,
        updatedAt: olderHostTime + 50,
      },
    ],
    strokes: [
      {
        id: "host-stroke-1",
        pageId: "page-1",
        tool: "pen",
        color: "#FFFFFF",
        size: 6,
        opacity: 1,
        isStylus: true,
        points: [
          [20, 20, 0.5],
          [80, 90, 0.7],
        ],
        updatedAt: olderHostTime,
      },
    ],
    items: [
      {
        id: "host-sticky-1",
        pageId: "page-2",
        type: "sticky",
        x: 100,
        y: 100,
        width: 240,
        height: 180,
        zIndex: 1,
        text: "งานจากโฮสต์",
        updatedAt: olderHostTime,
      },
    ],
    roomId: "SN-TEST99",
    metaUpdatedAt: olderHostTime,
    createdAt: olderHostTime,
    updatedAt: olderHostTime + 50,
  };

  // Guest opens invite link much later -> guest timestamps MUST NOT overwrite host metadata
  const guest = createGuestRoomNotebook("SN-TEST99");
  assert.equal(guest.metaUpdatedAt, 0);
  assert.equal(guest.createdAt, 0);

  const mergedOnGuest = mergeNotebook(guest, host);
  assert.equal(mergedOnGuest.title, "สมุดจดจริงของโฮสต์");
  assert.equal(mergedOnGuest.paperTemplate, "dark_grid");
  assert.equal(mergedOnGuest.createdAt, olderHostTime);
  assert.equal(mergedOnGuest.strokes.length, 1);
  assert.equal(mergedOnGuest.items.length, 1);

  const pages = ensureNotebookPages(mergedOnGuest);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].paperTemplate, "dark_grid");
  assert.equal(pages[1].paperTemplate, "cornell");
});

test("shouldPromptAppUpdate detects new builds cleanly and respects snooze window", () => {
  const t0 = 1_750_000_000_000;

  // Same build or dev mode should never prompt
  assert.equal(
    shouldPromptAppUpdate({ clientBuildId: "abc123", serverBuildId: "abc123", now: t0 }),
    false
  );
  assert.equal(
    shouldPromptAppUpdate({ clientBuildId: "dev", serverBuildId: "abc123", now: t0 }),
    false
  );
  assert.equal(
    shouldPromptAppUpdate({ clientBuildId: "abc123", serverBuildId: "dev", now: t0 }),
    false
  );

  // Newer deployed build triggers prompt immediately
  assert.equal(
    shouldPromptAppUpdate({ clientBuildId: "abc123", serverBuildId: "def456", now: t0 }),
    true
  );

  // Snoozing def456 suppresses until UPDATE_SNOOZE_MS elapses
  assert.equal(
    shouldPromptAppUpdate({
      clientBuildId: "abc123",
      serverBuildId: "def456",
      snoozedBuildId: "def456",
      snoozedUntil: t0 + UPDATE_SNOOZE_MS,
      now: t0 + 5_000,
    }),
    false
  );
  assert.equal(
    shouldPromptAppUpdate({
      clientBuildId: "abc123",
      serverBuildId: "def456",
      snoozedBuildId: "def456",
      snoozedUntil: t0 + UPDATE_SNOOZE_MS,
      now: t0 + UPDATE_SNOOZE_MS + 1,
    }),
    true
  );

  // If an even newer build (ghi789) deploys while def456 is snoozed, prompt immediately
  assert.equal(
    shouldPromptAppUpdate({
      clientBuildId: "abc123",
      serverBuildId: "ghi789",
      snoozedBuildId: "def456",
      snoozedUntil: t0 + UPDATE_SNOOZE_MS,
      now: t0 + 5_000,
    }),
    true
  );
});

test("attachNotebookToRoom and mergeNotebook converge deterministically after offline forked work", () => {
  const sharedPage1 = {
    id: "page-1",
    paperTemplate: "lined" as const,
    pageHeight: 1600,
    order: 0,
    updatedAt: 1000,
  };

  // Both worked offline after closing Live: both added a new page with order: 1
  const hostOffline: ShootNotebook = {
    id: "nb-host",
    kind: "notebook",
    title: "งานกลุ่มบทที่ 1",
    paperTemplate: "lined",
    pageHeight: 1600,
    pages: [
      sharedPage1,
      {
        id: "page-host-2",
        paperTemplate: "grid",
        pageHeight: 1600,
        order: 1,
        updatedAt: 2000,
      },
    ],
    strokes: [
      {
        id: "stroke-host",
        pageId: "page-1",
        tool: "pen",
        color: "#1C1B18",
        size: 6,
        opacity: 1,
        isStylus: true,
        points: [
          [10, 10, 0.5],
          [50, 50, 0.5],
        ],
        updatedAt: 2100,
      },
    ],
    items: [
      {
        id: "sticky-host",
        pageId: "page-host-2",
        type: "sticky",
        x: 40,
        y: 40,
        width: 200,
        height: 150,
        zIndex: 1,
        text: "ส่วนของพลอย",
        updatedAt: 2200,
      },
    ],
    roomId: "SN-MERGE1",
    metaUpdatedAt: 2000,
    createdAt: 1000,
    updatedAt: 2200,
  };

  const friendOfflineCopy: ShootNotebook = {
    id: "nb-friend",
    kind: "notebook",
    title: "งานกลุ่มบทที่ 1",
    paperTemplate: "lined",
    pageHeight: 1600,
    pages: [
      sharedPage1,
      {
        id: "page-friend-2",
        paperTemplate: "dark_lined",
        pageHeight: 1600,
        order: 1,
        updatedAt: 2500,
      },
    ],
    strokes: [
      {
        id: "stroke-friend",
        pageId: "page-1",
        tool: "pen",
        color: "#0F766E",
        size: 6,
        opacity: 1,
        isStylus: false,
        points: [
          [120, 120, 0.5],
          [180, 140, 0.5],
        ],
        updatedAt: 2400,
      },
    ],
    items: [
      {
        id: "sticky-friend",
        pageId: "page-friend-2",
        type: "sticky",
        x: 80,
        y: 80,
        width: 220,
        height: 150,
        zIndex: 2,
        text: "ส่วนของต้น",
        updatedAt: 2600,
      },
    ],
    metaUpdatedAt: 1500,
    createdAt: 1000,
    updatedAt: 2600,
  };

  const friendAttached = attachNotebookToRoom(friendOfflineCopy, "sn-merge1");
  assert.equal(friendAttached.roomId, "SN-MERGE1");

  const mergedOnHost = mergeNotebook(hostOffline, friendAttached);
  const mergedOnFriend = mergeNotebook(friendAttached, hostOffline);

  const hostPages = ensureNotebookPages(mergedOnHost);
  const friendPages = ensureNotebookPages(mergedOnFriend);

  // Both devices converge to exact same 3 pages in identical deterministic order
  assert.deepEqual(
    hostPages.map((p) => p.id),
    ["page-1", "page-host-2", "page-friend-2"]
  );
  assert.deepEqual(
    friendPages.map((p) => p.id),
    hostPages.map((p) => p.id)
  );

  // Both strokes and both stickies preserved on both devices
  assert.equal(mergedOnHost.strokes.length, 2);
  assert.equal(mergedOnFriend.strokes.length, 2);
  assert.equal(mergedOnHost.items.length, 2);
  assert.equal(mergedOnFriend.items.length, 2);
});

test("recognizeHeldShape snaps hand-drawn straight lines, arrows, circles, rectangles, and triangles", () => {
  // Horizontal-ish line (2 deg drift -> snaps flat horizontal)
  const linePts = Array.from({ length: 12 }, (_, i) => [
    50 + i * 20,
    100 + (i % 2 === 0 ? 1.5 : -1.5),
    0.5,
  ]) as Array<[number, number, number]>;
  const line = recognizeHeldShape(linePts);
  assert.equal(line?.kind, "line");
  assert.ok(line && Math.abs(line.points[0][1] - line.points[line.points.length - 1][1]) < 0.01);

  // Circle
  const circlePts = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [200 + 50 * Math.cos(a), 200 + 50 * Math.sin(a), 0.5] as [
      number,
      number,
      number,
    ];
  });
  circlePts.push([circlePts[0][0], circlePts[0][1], 0.5]);
  assert.equal(recognizeHeldShape(circlePts)?.kind, "circle");

  // Rectangle
  const rectPts: Array<[number, number, number]> = [
    [100, 100, 0.5],
    [200, 100, 0.5],
    [300, 100, 0.5],
    [300, 175, 0.5],
    [300, 250, 0.5],
    [200, 250, 0.5],
    [100, 250, 0.5],
    [100, 175, 0.5],
    [100, 105, 0.5],
  ];
  assert.equal(recognizeHeldShape(rectPts)?.kind, "rect");

  // Triangle
  const triPts: Array<[number, number, number]> = [
    [200, 80, 0.5],
    [245, 160, 0.5],
    [290, 240, 0.5],
    [200, 240, 0.5],
    [110, 240, 0.5],
    [155, 160, 0.5],
    [180, 120, 0.5],
    [200, 84, 0.5],
  ];
  assert.equal(recognizeHeldShape(triPts)?.kind, "triangle");

  // Arrow (shaft + hook)
  const arrowPts: Array<[number, number, number]> = [
    [50, 150, 0.5],
    [110, 150, 0.5],
    [170, 150, 0.5],
    [230, 150, 0.5],
    [290, 150, 0.5],
    [265, 130, 0.5],
    [290, 150, 0.5],
    [265, 170, 0.5],
  ];
  assert.equal(recognizeHeldShape(arrowPts)?.kind, "arrow");
});

test("evaluateScientificMath handles trig (DEG/RAD), log/ln, factorial, implicit mult, and linear equations", () => {
  const degRes = evaluateScientificMath("sin(30) + sqrt(16)", { angleMode: "deg" });
  assert.equal(degRes.ok, true);
  if (degRes.ok) assert.equal(degRes.formatted, "4.5");

  const radRes = evaluateScientificMath("cos(pi) + ln(e^2) + log(100)", { angleMode: "rad" });
  assert.equal(radRes.ok, true);
  if (radRes.ok) assert.equal(radRes.formatted, "3");

  const factRes = evaluateScientificMath("5! / (2 * 3) + 2pi");
  assert.equal(factRes.ok, true);
  if (factRes.ok) assert.ok(Math.abs(factRes.value - (20 + 2 * Math.PI)) < 1e-6);

  const linearRes = evaluateScientificMath("2x + 5 = 19");
  assert.equal(linearRes.ok, true);
  if (linearRes.ok) {
    assert.equal(linearRes.solvedVariable, "x");
    assert.equal(linearRes.formatted, "7");
  }

  const badRes = evaluateScientificMath("10 / 0");
  assert.equal(badRes.ok, false);
});

test("parseYouTubeUrl and detectLinkProvider parse video IDs, timestamps, and research providers", () => {
  assert.deepEqual(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=1m30s"), {
    videoId: "dQw4w9WgXcQ",
    startSeconds: 90,
  });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/watch?v=abc123XYZ_0&start=42"), {
    videoId: "abc123XYZ_0",
    startSeconds: 42,
  });
  assert.deepEqual(parseYouTubeUrl("https://youtube.com/shorts/short999AA"), {
    videoId: "short999AA",
    startSeconds: 0,
  });
  assert.equal(parseYouTubeUrl("https://drive.google.com/file/d/123/view"), null);

  assert.equal(detectLinkProvider("https://drive.google.com/drive/folders/123"), "gdrive");
  assert.equal(detectLinkProvider("https://1drv.ms/b/s!xyz"), "onedrive");
  assert.equal(detectLinkProvider("https://arxiv.org/pdf/2501.00001.pdf"), "pdf");
});

test("createEmptyNotebook('slides') creates 16:9 slide deck and createMeetingPageItems appends cleanly", () => {
  const deck = createEmptyNotebook("slides", "พรีเซนต์งานวิจัย");
  assert.equal(deck.kind, "slides");
  const pages = ensureNotebookPages(deck);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].aspect, "slide16x9");
  assert.equal(pages[0].pageHeight, 720);
  assert.ok(deck.items.length >= 2);

  const sampleMeeting = {
    id: "m-append",
    createdAt: 1000,
    updatedAt: 1000,
    sourceType: "demo" as const,
    fileName: "interview.m4a",
    hasLocalAudio: false,
    analysis: {
      meetingTitle: "สัมภาษณ์กลุ่มตัวอย่าง",
      executiveSummary: "พบแนวโน้มการใช้งานเพิ่มขึ้น",
      participants: ["พลอย"],
      keyDecisions: ["เก็บข้อมูลเพิ่ม 20 ชุด"],
      blockers: [],
      topics: [],
      tasks: [],
      transcript: [],
      mindMap: { id: "root", label: "สัมภาษณ์", nodeType: "root" as const, children: [] },
    },
  };
  const appended = createMeetingPageItems(sampleMeeting, "page-ai-2", 10);
  assert.ok(appended.items.length >= 1);
  assert.ok(appended.items.every((it) => it.pageId === "page-ai-2"));
});

test("folder helpers create folders, move notebooks, compute breadcrumbs/counts, and safely unfile on folder delete", () => {
  const rootFolder = createFolder("งานวิจัย", "#0F766E", null);
  const subFolder = createFolder("บทที่ 1", "#2563EB", rootFolder.id);
  const otherFolder = createFolder("ส่วนตัว", "#D97706", null);

  assert.equal(rootFolder.name, "งานวิจัย");
  assert.equal(subFolder.parentId, rootFolder.id);

  const nb1 = createEmptyNotebook("notebook", "โน้ตทดลอง", null);
  const nb2 = createEmptyNotebook("slides", "สไลด์ประชุม", rootFolder.id);

  // Move nb1 into nested subfolder
  const moved1 = moveNotebookToFolder([nb1, nb2], nb1.id, subFolder.id);
  assert.equal(moved1.updatedNotebook?.folderId, subFolder.id);

  // Recursive count & breadcrumbs
  const folders: NotebookFolder[] = [rootFolder, subFolder, otherFolder];
  assert.equal(countNotebooksInFolder(moved1.notebooks, folders, rootFolder.id), 2);
  assert.equal(countNotebooksInFolder(moved1.notebooks, folders, subFolder.id), 1);
  assert.equal(countNotebooksInFolder(moved1.notebooks, folders, otherFolder.id), 0);

  const crumbs = getFolderBreadcrumbs(folders, subFolder.id);
  assert.deepEqual(
    crumbs.map((c) => c.id),
    [rootFolder.id, subFolder.id]
  );

  // Cycle guard prevents moving a folder into its own descendant or itself
  assert.equal(canMoveFolderInto(folders, rootFolder.id, subFolder.id), false);
  assert.equal(canMoveFolderInto(folders, rootFolder.id, rootFolder.id), false);
  assert.equal(canMoveFolderInto(folders, otherFolder.id, subFolder.id), true);

  // Deleting rootFolder must NOT delete nb2 or subFolder; both promote to null
  const removed = removeFolderAndUnfileNotebooks(
    folders,
    moved1.notebooks,
    rootFolder.id
  );
  assert.equal(removed.folders.length, 2);
  assert.equal(removed.notebooks.length, 2);
  assert.equal(
    removed.folders.find((f) => f.id === subFolder.id)?.parentId,
    null
  );
  assert.equal(
    removed.notebooks.find((n) => n.id === nb2.id)?.folderId,
    null
  );
  // nb1 inside subFolder keeps subFolder
  assert.equal(
    removed.notebooks.find((n) => n.id === nb1.id)?.folderId,
    subFolder.id
  );

  // mergeNotebook preserves local folderId across remote Live sync
  const localWithFolder = { ...nb1, folderId: otherFolder.id };
  const remoteWithoutFolder = { ...nb1, folderId: null, title: "ชื่อจากเพื่อน", metaUpdatedAt: nb1.metaUpdatedAt + 500 };
  const merged = mergeNotebook(localWithFolder, remoteWithoutFolder);
  assert.equal(merged.title, "ชื่อจากเพื่อน");
  assert.equal(merged.folderId, otherFolder.id);
});

test("paper size and orientation helpers resolve portrait, landscape, and legacy slide pages accurately", () => {
  const a4Portrait = getDimensionsForPaperSize("a4", "portrait");
  assert.deepEqual(a4Portrait, { width: 1000, height: 1414 });

  const a4Landscape = getDimensionsForPaperSize("a4", "landscape");
  assert.deepEqual(a4Landscape, { width: 1414, height: 1000 });

  const a3Portrait = getDimensionsForPaperSize("a3", "portrait");
  assert.deepEqual(a3Portrait, { width: 1414, height: 2000 });

  const slideResolved = resolvePageDimensions({
    id: "pg-slide",
    paperTemplate: "blank",
    pageHeight: 720,
    aspect: "slide16x9",
    order: 0,
    updatedAt: 1,
  });
  assert.equal(slideResolved.width, 1280);
  assert.equal(slideResolved.height, 720);
  assert.equal(slideResolved.orientation, "landscape");

  const customPdfPage = resolvePageDimensions({
    id: "pg-pdf",
    paperTemplate: "blank",
    paperSize: "pdf_custom",
    orientation: "landscape",
    pageWidth: 1480,
    pageHeight: 1046,
    order: 0,
    updatedAt: 1,
  });
  assert.equal(customPdfPage.width, 1480);
  assert.equal(customPdfPage.height, 1046);
  assert.equal(customPdfPage.orientation, "landscape");
});

test("partial eraser densifies straight lines, splits cleanly in the middle, and respects page boundaries", () => {
  const straightLine: InkStroke = {
    id: "line-1",
    pageId: "page-1",
    tool: "pen",
    color: "#1C1B18",
    size: 6,
    opacity: 1,
    isStylus: true,
    points: [
      [0, 100, 0.5],
      [200, 100, 0.5],
    ],
    updatedAt: 100,
  };

  // Erase a circle of radius 20 right at the midpoint (100, 100)
  const split = eraseStrokePartially(straightLine, 100, 100, 20, 500);
  assert.equal(split.changed, true);
  assert.equal(split.tombstone?.deleted, true);
  assert.equal(split.tombstone?.id, "line-1");
  assert.equal(split.fragments.length, 2);
  assert.ok(split.fragments[0].points[split.fragments[0].points.length - 1][0] < 85);
  assert.ok(split.fragments[1].points[0][0] > 115);

  // Diagonal drag erase across segment
  const otherPageStroke: InkStroke = {
    ...straightLine,
    id: "line-p2",
    pageId: "page-2",
  };
  const dragRes = applyPartialEraseAlongSegment(
    [straightLine, otherPageStroke],
    "page-1",
    true,
    100,
    70,
    100,
    130,
    18,
    900
  );
  assert.equal(dragRes.anyChanged, true);
  assert.equal(dragRes.erasedTombstones.length, 1);
  assert.equal(dragRes.addedFragments.length, 2);
  // Page 2 stroke remains untouched
  assert.equal(
    dragRes.strokes.find((s) => s.id === "line-p2")?.deleted,
    undefined
  );
});

test("getShapeSvgPath produces valid closed SVG paths for all 16 SHAPE_CATALOG kinds", () => {
  assert.equal(SHAPE_CATALOG.length, 16);
  for (const spec of SHAPE_CATALOG) {
    const d = getShapeSvgPath(spec.kind, spec.defaultWidth, spec.defaultHeight);
    assert.ok(d.startsWith("M "), `Shape ${spec.kind} path must start with M`);
    assert.ok(d.endsWith(" Z"), `Shape ${spec.kind} path must end with Z`);
    assert.equal(d.includes("NaN"), false, `Shape ${spec.kind} must not contain NaN`);
  }
});

test("evaluateScientificMath solves 2-variable equations (5x+3=y), substitutions, quadratics, 2-equation systems, and trailing =", () => {
  // Trailing "="
  const trailing = evaluateScientificMath("5 * 3 + 2 =");
  assert.equal(trailing.ok, true);
  if (trailing.ok) {
    assert.equal(trailing.value, 17);
  }

  // 2-variable linear equation: 5x + 3 = y
  const twoVar = evaluateScientificMath("5x+3=y");
  assert.equal(twoVar.ok, true);
  if (twoVar.ok) {
    assert.equal(twoVar.kind, "linear2var");
    assert.equal(twoVar.formatted, "y = 5x + 3");
    assert.deepEqual(twoVar.variables, ["x", "y"]);
    assert.ok(twoVar.summaryLines?.includes("x = (y - 3) / 5"));
    assert.ok(twoVar.summaryLines?.some((l) => l.includes("x = 0 ⇒ y = 3")));
    assert.ok(twoVar.summaryLines?.some((l) => l.includes("y = 0 ⇒ x = -0.6")));
    assert.equal(twoVar.sampleTable?.length, 5);
    assert.equal(twoVar.sampleTable?.[1].outputs.y, "3");
    assert.equal(twoVar.sampleTable?.[3].outputs.y, "13");
  }

  // Variable substitution on 5x + 3 = y
  const subX = evaluateScientificMath("5x+3=y", { substitutions: { x: 2 } });
  assert.equal(subX.ok, true);
  if (subX.ok) {
    assert.equal(subX.solvedVariable, "y");
    assert.equal(subX.value, 13);
  }
  const subY = evaluateScientificMath("5x+3=y", { substitutions: { y: 18 } });
  assert.equal(subY.ok, true);
  if (subY.ok) {
    assert.equal(subY.solvedVariable, "x");
    assert.equal(subY.value, 3);
  }

  // Quadratic equations (real + complex roots)
  const quadReal = evaluateScientificMath("x^2 - 5x + 6 = 0");
  assert.equal(quadReal.ok, true);
  if (quadReal.ok) {
    assert.equal(quadReal.kind, "quadratic1var");
    assert.deepEqual(quadReal.roots, ["3", "2"]);
  }
  const quadComplex = evaluateScientificMath("x^2 + 1 = 0");
  assert.equal(quadComplex.ok, true);
  if (quadComplex.ok) {
    assert.equal(quadComplex.kind, "quadratic1var");
    assert.deepEqual(quadComplex.roots, ["i", "-i"]);
  }

  // 2-equation linear system: 5x + 3 = y; x + y = 15
  const sys = evaluateScientificMath("5x+3=y; x+y=15");
  assert.equal(sys.ok, true);
  if (sys.ok) {
    assert.equal(sys.kind, "system2var");
    assert.deepEqual(sys.systemSolution, { x: "2", y: "13" });
    assert.equal(sys.formatted, "x = 2, y = 13");
  }
});
