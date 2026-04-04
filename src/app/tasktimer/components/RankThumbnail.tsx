"use client";

import AppImg from "@/components/AppImg";
import {
  getStoredRankThumbnailDescriptor,
  type RankThumbnailDescriptor,
} from "../lib/rewards";

type RankThumbnailProps = {
  rankId: string;
  storedThumbnailSrc?: string;
  className?: string;
  imageClassName?: string;
  placeholderClassName?: string;
  alt?: string;
  size?: number;
  "aria-hidden"?: boolean;
};

function resolveDescriptor(rankId: string, storedThumbnailSrc: string): RankThumbnailDescriptor {
  return getStoredRankThumbnailDescriptor(rankId, storedThumbnailSrc);
}

export default function RankThumbnail({
  rankId,
  storedThumbnailSrc = "",
  className = "",
  imageClassName = "",
  placeholderClassName = "",
  alt = "",
  size = 34,
  "aria-hidden": ariaHidden,
}: RankThumbnailProps) {
  const descriptor = resolveDescriptor(rankId, storedThumbnailSrc);
  if (descriptor.kind === "image") {
    return (
      <span className={className || undefined} aria-hidden={ariaHidden ? "true" : undefined}>
        <AppImg className={imageClassName || undefined} src={descriptor.src} alt={alt} width={size} height={size} />
      </span>
    );
  }
  return (
    <span className={className || undefined} aria-hidden={ariaHidden ? "true" : undefined}>
      <span className={placeholderClassName || undefined}>{descriptor.label}</span>
    </span>
  );
}
