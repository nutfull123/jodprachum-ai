import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShootNote · สมุดจด GoodNotes & ถอดเสียงประชุม AI",
    short_name: "ShootNote",
    description:
      "สมุดจดสไตล์ GoodNotes รองรับปากกา iPad ตกแต่ง แนบภาพ/คลิป ShortNote แชร์ทำร่วมกันเรียลไทม์ พร้อมถอดเสียงประชุม AI",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F8F7F4",
    theme_color: "#0F766E",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
