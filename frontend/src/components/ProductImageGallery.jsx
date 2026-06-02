import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { APP_BASE_URL } from "../services/api";

export default function ProductImageGallery({ variants = [], selectedVariant, onSelect }) {
  const [open, setOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  const galleryVariants = useMemo(
    () => variants.filter((variant) => variant.image_url),
    [variants]
  );

  const selectedGalleryIndex = useMemo(
    () =>
      Math.max(
        0,
        galleryVariants.findIndex(
          (variant) => Number(variant.id) === Number(selectedVariant?.id)
        )
      ),
    [galleryVariants, selectedVariant]
  );

  const selectedImageUrl = selectedVariant?.image_url
    ? `${APP_BASE_URL}${selectedVariant.image_url}`
    : "";
  const hasMultipleImages = galleryVariants.length > 1;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const goToGalleryImage = (direction) => {
    if (!galleryVariants.length) return;
    const nextIndex =
      (selectedGalleryIndex + direction + galleryVariants.length) % galleryVariants.length;
    onSelect(galleryVariants[nextIndex]);
  };

  useEffect(() => {
    if (!open || !hasMultipleImages) return;

    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") goToGalleryImage(-1);
      if (event.key === "ArrowRight") goToGalleryImage(1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [galleryVariants, hasMultipleImages, open, selectedGalleryIndex]);

  const handleDownloadImage = async (event) => {
    event.stopPropagation();
    if (!selectedImageUrl) return;

    const imageName =  selectedVariant.name || "product-image";
    const fileName = `${imageName.replace(/[^\w-]+/g, "-")}.jpg`;

    try {
      const response = await fetch(selectedImageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(selectedImageUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleTouchEnd = (event) => {
    if (touchStartX === null || !hasMultipleImages) return;

    const deltaX = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(deltaX) > 50) {
      goToGalleryImage(deltaX > 0 ? 1 : -1);
    }
    setTouchStartX(null);
  };

  if (!selectedImageUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute inset-0 cursor-zoom-in"
        aria-label="Open product image gallery"
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-3 py-20 sm:p-4"
          style={{ touchAction: "none" }}
          onClick={() => setOpen(false)}
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="relative max-w-4xl w-full max-h-[78vh] sm:max-h-[90vh] flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedImageUrl}
              alt={selectedVariant.name}
              className="max-w-full max-h-[72vh] sm:max-h-[85vh] object-contain rounded-xl sm:rounded-2xl shadow-2xl"
            />

            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={() => goToGalleryImage(-1)}
                  className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-black/35 sm:bg-white/90 text-white sm:text-slate-900 shadow-lg flex items-center justify-center hover:bg-black/50 sm:hover:bg-white transition"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => goToGalleryImage(1)}
                  className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-black/35 sm:bg-white/90 text-white sm:text-slate-900 shadow-lg flex items-center justify-center hover:bg-black/50 sm:hover:bg-white transition"
                  aria-label="Next image"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-xl sm:rounded-b-2xl px-4 py-2 sm:py-3">
              <p className="text-white font-semibold text-sm text-center">
                {selectedVariant.article_code || selectedVariant.name}
                {selectedVariant.color && (
                  <span className="ml-2 text-slate-300 font-normal">
                    · {selectedVariant.color}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div
            className="absolute left-3 right-3 top-3 flex items-center justify-between gap-3 sm:left-auto sm:right-4 sm:top-4 sm:justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="min-w-0 truncate rounded-full bg-black/40 px-3 py-2 text-xs font-semibold text-white sm:hidden">
              {selectedVariant.article_code || selectedVariant.name}
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleDownloadImage}
                className="bg-white/95 text-slate-800 rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-white transition-all"
                aria-label="Download image"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-white/95 text-slate-800 rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:bg-white transition-all"
                aria-label="Close image viewer"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {hasMultipleImages && (
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[92vw] overflow-x-auto sm:bottom-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-2">
                {galleryVariants.map((variant, index) => (
                  <button
                    type="button"
                    key={variant.id}
                    onClick={() => onSelect(variant)}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${
                      index === selectedGalleryIndex
                        ? "border-white"
                        : "border-white/20 opacity-70"
                    }`}
                    aria-label={`View ${variant.color || variant.name}`}
                  >
                    <img
                      src={`${APP_BASE_URL}${variant.image_url}`}
                      alt={variant.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
