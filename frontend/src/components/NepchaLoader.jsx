import { useEffect, useRef, useState } from "react";
import { Factory } from "lucide-react";
import loaderShoe from "../assets/nepcha-loader-shoe.webp";

export function NepchaLoader({ overlay = false, label = "Loading..." }) {
  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[100] flex items-center justify-center bg-white/95 backdrop-blur-[2px]"
          : "flex min-h-[45vh] items-center justify-center"
      }
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="nepcha-loader text-center">
        <div className="nepcha-loader__brand">NEPCHA INDUSTRY</div>

        <div className="nepcha-loader__production" aria-hidden="true">
          <div className="nepcha-loader__factory">
            <Factory />
            <span className="nepcha-loader__smoke nepcha-loader__smoke--one" />
            <span className="nepcha-loader__smoke nepcha-loader__smoke--two" />
          </div>

          <div className="nepcha-loader__conveyor">
            <span className="nepcha-loader__belt" />
            <span className="nepcha-loader__roller nepcha-loader__roller--one" />
            <span className="nepcha-loader__roller nepcha-loader__roller--two" />
            <span className="nepcha-loader__roller nepcha-loader__roller--three" />
          </div>

          <img
            className="nepcha-loader__finished-shoe"
            src={loaderShoe}
            alt=""
          />
        </div>

        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

export function InitialLoadingOverlay() {
  const [mounted, setMounted] = useState(true);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setActive(false);
      window.dispatchEvent(new Event("nepcha:initial-loader-complete"));
    }, 2200);
    const unmountTimer = window.setTimeout(() => setMounted(false), 2500);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`transition-opacity duration-300 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <NepchaLoader overlay label="Preparing Nepcha..." />
    </div>
  );
}

export function ApiLoadingOverlay() {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const unmountTimerRef = useRef(null);
  const mountedRef = useRef(false);
  const visibleSinceRef = useRef(0);
  const initialCompleteRef = useRef(false);
  const requestActiveRef = useRef(false);

  useEffect(() => {
    const clearTimers = () => {
      window.clearTimeout(showTimerRef.current);
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(unmountTimerRef.current);
    };

    const handleLoading = (event) => {
      const isLoading = Boolean(event.detail?.loading);
      requestActiveRef.current = isLoading;

      if (!initialCompleteRef.current) return;

      window.clearTimeout(showTimerRef.current);
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(unmountTimerRef.current);

      if (isLoading) {
        if (mountedRef.current) {
          setActive(true);
          return;
        }

        showTimerRef.current = window.setTimeout(() => {
          mountedRef.current = true;
          visibleSinceRef.current = Date.now();
          setMounted(true);
          window.requestAnimationFrame(() => setActive(true));
        }, 220);
        return;
      }

      if (!mountedRef.current) return;

      const visibleFor = Date.now() - visibleSinceRef.current;
      const remainingMinimum = Math.max(0, 900 - visibleFor);

      hideTimerRef.current = window.setTimeout(() => {
        setActive(false);
        unmountTimerRef.current = window.setTimeout(() => {
          mountedRef.current = false;
          setMounted(false);
        }, 300);
      }, remainingMinimum);
    };

    const handleInitialComplete = () => {
      initialCompleteRef.current = true;
      if (requestActiveRef.current) {
        handleLoading({ detail: { loading: true } });
      }
    };

    window.addEventListener("nepcha:api-loading", handleLoading);
    window.addEventListener("nepcha:initial-loader-complete", handleInitialComplete);
    return () => {
      clearTimers();
      window.removeEventListener("nepcha:api-loading", handleLoading);
      window.removeEventListener("nepcha:initial-loader-complete", handleInitialComplete);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`transition-opacity duration-300 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <NepchaLoader overlay />
    </div>
  );
}
