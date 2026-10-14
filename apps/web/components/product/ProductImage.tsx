"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

/** Real product photo (extracted from the DB's image_url), with a gradient
 * placeholder fallback for missing/broken images. `fit="cover"` (default)
 * crops to fill — used for thumbnails/grid cards. `fit="contain"` scales
 * the whole image down to fit, centered, with no cropping — used on the
 * product detail screen so the full product photo is always visible. */
export function ProductImage({
  src,
  alt,
  className,
  sizes = "200px",
  fit = "cover",
}: {
  src: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  fit?: "cover" | "contain";
}) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        !showImage && "bg-gradient-to-br from-secondary-dim to-mint-dim",
        showImage && fit === "contain" && "bg-white",
        className
      )}
    >
      {showImage && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={fit === "contain" ? "object-contain" : "object-cover"}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
