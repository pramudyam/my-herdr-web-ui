import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";

import "./WebcamModal.css";
import { useT } from "../lib/i18n.ts";

export interface WebcamModalProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function WebcamModal({ onCapture, onClose }: WebcamModalProps) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Webcam is not supported on this browser.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (mounted) {
              void videoRef.current?.play();
              setReady(true);
            }
          };
        }
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    }

    void startCamera();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKeyDown);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [onClose]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !ready) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `webcam-snap-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal webcam-modal" role="dialog" aria-modal="true" aria-label={t("Take photo")}>
        <div className="modal-header">
          <Camera aria-hidden="true" size={18} />
          <h2 className="modal-title">{t("Take photo")}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t("Discard saved copy")}
            title={t("Discard saved copy")}
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="webcam-preview-container">
            {error ? (
              <div className="webcam-error-box">
                <p>{error}</p>
              </div>
            ) : (
              <>
                <video ref={videoRef} className="webcam-video-element" autoPlay playsInline muted />
                {!ready && <div className="webcam-loading-box"><span>Starting camera…</span></div>}
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="webcam-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="webcam-btn-snap" disabled={!ready || Boolean(error)} onClick={snap}>
            <Camera aria-hidden="true" size={16} />
            <span>Snap Photo</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
