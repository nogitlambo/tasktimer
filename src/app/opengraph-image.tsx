import { ImageResponse } from "next/og";
import { absoluteUrl, seoConfig } from "./seo";

export const alt = "TaskLaunch neurodivergent-friendly productivity app preview";
export const contentType = "image/png";
export const dynamic = "force-static";
export const size = {
  width: 1200,
  height: 630,
};

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0d0f13",
          color: "#f8fbff",
          padding: "72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            maxWidth: "760px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              fontSize: "34px",
              fontWeight: 800,
              letterSpacing: "0px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires plain img elements. */}
            <img src={absoluteUrl(seoConfig.logoPath)} width={76} height={70} alt="" />
            <span>{seoConfig.appName}</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "68px",
              lineHeight: 1.04,
              fontWeight: 900,
              letterSpacing: "0px",
            }}
          >
            Neurodivergent-friendly productivity
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              lineHeight: 1.35,
              color: "#b7c9d7",
            }}
          >
            Flexible task management for ADHD workflows, executive dysfunction, focus timers, and sustainable momentum.
          </div>
        </div>
        <div
          style={{
            width: "270px",
            height: "270px",
            borderRadius: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, rgba(0,229,255,.25), rgba(255,76,201,.22))",
            border: "1px solid rgba(255,255,255,.18)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires plain img elements. */}
          <img src={absoluteUrl(seoConfig.appIconPath)} width={190} height={190} alt="" />
        </div>
      </div>
    ),
    size
  );
}
