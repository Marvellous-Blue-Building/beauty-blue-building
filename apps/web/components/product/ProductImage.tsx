"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

/** Real product photo (extracted from the DB's image_url), with a gradient placeholder fallback for missing/broken images. */
export function ProductImage({
  src,
  alt,
  className,
  sizes = "200px",
}: {
  src: string | null;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        !showImage && "bg-gradient-to-br from-secondary-dim to-mint-dim",
        className
      )}
    >
      {showImage && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
