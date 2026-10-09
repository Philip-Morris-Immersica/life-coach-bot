import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const ALLOWED = new Set([32, 180, 192, 512]);

// Генерира PNG иконите на приложението (без бинарни файлове в репото).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!ALLOWED.has(size)) return new Response("Not found", { status: 404 });
  const maskable = req.nextUrl.searchParams.get("maskable") === "1";

  // За maskable иконите съдържанието е в безопасната централна зона (~60%).
  const glyph = Math.round(size * (maskable ? 0.42 : 0.56));
  const radius = maskable ? 0 : Math.round(size * 0.22);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #3f8a74 0%, #2f6f5e 55%, #245547 100%)",
          borderRadius: radius,
        }}
      >
        <div
          style={{
            width: glyph,
            height: glyph,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.94)",
          }}
        >
          <div
            style={{
              width: Math.round(glyph * 0.46),
              height: Math.round(glyph * 0.46),
              borderRadius: "50% 0 50% 50%",
              background: "#2f6f5e",
              transform: "rotate(-45deg)",
            }}
          />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    }
  );
}
