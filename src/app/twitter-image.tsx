import { ImageResponse } from "next/og";
import { absoluteUrl, seoConfig } from "./seo";

export const alt = "TaskLaunch flexible task management social preview";
export const contentType = "image/png";
export const dynamic = "force-static";
export const size = {
  width: 1200,
  height: 600,
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
          background: "#0d0f13",
          color: "#f8fbff",
          padding: "64px 76px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxWidth: "820px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              fontSize: "32px",
              fontWeight: 800,
              letterSpacing: "0px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires plain img elements. */}
            <img src={absoluteUrl(seoConfig.logoPath)} width={70} height={64} alt="" />
            <span>{seoConfig.appName}</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: "0px",
            }}
          >
            Break free from guilt-driven productivity systems
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              lineHeight: 1.35,
              color: "#b7c9d7",
            }}
          >
            Flexible task management for neurodivergent minds.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires plain img elements. */}
        <img src={absoluteUrl(seoConfig.appIconPath)} width={190} height={190} alt="" />
      </div>
    ),
    size
  );
}
