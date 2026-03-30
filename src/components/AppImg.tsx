import type { ImgHTMLAttributes } from "react";

type AppImgProps = ImgHTMLAttributes<HTMLImageElement> & { alt: string };

export default function AppImg(props: AppImgProps) {
  // TaskTimer uses many CSS- and ID-driven image hooks, including dynamically
  // assigned sources, so this wrapper intentionally preserves native img behavior.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} />;
}
