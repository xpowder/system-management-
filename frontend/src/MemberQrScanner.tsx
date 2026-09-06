import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck, LogOut, QrCode, X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { gymApi, httpStatus, type MemberQrLookup } from "./gymApi";
import { useLang } from "./i18n";
import { Alert, EmptyState, LoadingState } from "./ui";

type ScanPhase = "starting" | "scanning" | "lookup" | "result" | "missing" | "camera" | "failed";

function extractQrToken(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return text;
  }
}

export function MemberQrScanner({
  isInside,
  canCheckIn,
  onCheckIn,
  onCheckOut,
  onOpenProfile,
  onClose,
}: {
  isInside: (memberId: number) => boolean;
  canCheckIn: (memberId: number) => boolean;
  onCheckIn: (memberId: number) => Promise<boolean> | void;
  onCheckOut: (memberId: number) => Promise<boolean> | void;
  onOpenProfile: (memberId: number) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const tRef = useRef(t);
  tRef.current = t;
  const readerId = "member-qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const stopChain = useRef(Promise.resolve());
  const [session, setSession] = useState(0);
  const [phase, setPhase] = useState<ScanPhase>("starting");
  const [error, setError] = useState("");
  const [cameraMissing, setCameraMissing] = useState(false);
  const [member, setMember] = useState<MemberQrLookup | null>(null);
  const [acting, setActing] = useState(false);

  const stopScanner = () => {
    stopChain.current = stopChain.current.then(async () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* already stopped */
      }
    });
    return stopChain.current;
  };

  const clearScanner = () => {
    stopChain.current = stopChain.current.then(async () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      scannerRef.current = null;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* already stopped */
      }
      try {
        scanner.clear();
      } catch {
        /* already cleared */
      }
    });
    return stopChain.current;
  };

  useEffect(() => {
    let cancelled = false;
    busyRef.current = false;
    setError("");
    setMember(null);
    setCameraMissing(false);
    setPhase("starting");

    const onDecoded = (decoded: string) => {
      if (busyRef.current || cancelled) return;
      const token = extractQrToken(decoded);
      if (!token) return;
      busyRef.current = true;
      void (async () => {
        await stopScanner();
        if (cancelled) return;
        setPhase("lookup");
        try {
          const found = await gymApi.memberQrLookup(token);
          if (cancelled) return;
          setMember(found);
          setError("");
          setPhase("result");
        } catch (e) {
          if (cancelled) return;
          if (httpStatus(e) === 404) {
            setPhase("missing");
            setError("");
          } else {
            setPhase("failed");
            setError(e instanceof Error ? e.message : tRef.current("att.fail"));
          }
        }
      })();
    };

    const start = async () => {
      await clearScanner();
      if (cancelled) return;
      const scanner = new Html5Qrcode(readerId, { verbose: false });
      scannerRef.current = scanner;
      const box = Math.max(180, Math.min(280, Math.floor(window.innerWidth * 0.62)));
      const config = { fps: 8, qrbox: { width: box, height: box }, aspectRatio: 1 };
      try {
        await scanner.start({ facingMode: "environment" }, config, onDecoded, () => undefined);
        if (!cancelled) setPhase("scanning");
        else await clearScanner();
      } catch {
        if (cancelled) return;
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) {
            setCameraMissing(true);
            setPhase("camera");
            setError("");
            return;
          }
          await scanner.start(cameras[0].id, config, onDecoded, () => undefined);
          if (!cancelled) setPhase("scanning");
          else await clearScanner();
        } catch {
          if (!cancelled) {
            setCameraMissing(false);
            setPhase("camera");
            setError("");
          }
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      busyRef.current = true;
      void clearScanner();
    };
  }, [session]);

  const scanAgain = () => {
    busyRef.current = false;
    setError("");
    setMember(null);
    setCameraMissing(false);
    setPhase("starting");
    setSession((value) => value + 1);
  };

  const runAction = async (action: () => Promise<boolean> | void) => {
    if (acting) return;
    setActing(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("att.fail"));
    } finally {
      setActing(false);
    }
  };

  const idle = phase === "result" || phase === "missing" || phase === "camera" || phase === "failed";
  const inside = member ? isInside(member.member_id) : false;
  const allowed = member ? canCheckIn(member.member_id) : false;

  return createPortal(
    <div
      className="member-details-overlay qr-scanner-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="member-details-panel form-panel qr-scanner-panel" role="dialog" aria-modal="true" aria-label={t("qr.scan")}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{t("att.eyebrow")}</span>
            <h3>{t("qr.scan")}</h3>
          </div>
          <button type="button" className="secondary qr-scanner-close" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
            <span>{t("common.close")}</span>
          </button>
        </div>
        <p className="qr-scanner-hint">{t("qr.instruction")}</p>
        {error && phase !== "camera" ? (
          <Alert onDismiss={() => setError("")} dismissLabel={t("common.dismiss")}>
            {error}
          </Alert>
        ) : null}

        <div className={`qr-scanner-stage${idle ? " is-idle" : ""}`}>
          <div id={readerId} className="qr-scanner-reader" />
          {phase === "starting" ? <LoadingState label={t("qr.starting")} /> : null}
          {phase === "lookup" ? <LoadingState label={t("qr.scanning")} /> : null}
        </div>

        {phase === "camera" ? (
          <EmptyState
            title={t("qr.cameraRequired")}
            hint={cameraMissing ? t("qr.noCamera") : t("qr.instruction")}
          />
        ) : null}

        {phase === "missing" ? (
          <EmptyState title={t("qr.notFound")} hint={t("qr.notFoundHint")} />
        ) : null}

        {phase === "result" && member ? (
          <article className="qr-scanner-result">
            <span className="eyebrow">{t("qr.member")}</span>
            <h3>{member.name}</h3>
            <div className="info-list">
              <p>
                <span>{t("qr.memberId")}</span>
                <strong>#{member.member_id}</strong>
              </p>
              <p>
                <span>{t("common.status")}</span>
                <strong>{member.is_active ? t("common.active") : t("common.inactive")}</strong>
              </p>
            </div>
            {!member.is_active ? <Alert tone="warning">{t("qr.inactive")}</Alert> : null}
            <div className="form-actions">
              {member.is_active ? (
                inside ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={acting}
                    onClick={() => void runAction(() => onCheckOut(member.member_id))}
                  >
                    <LogOut size={16} />
                    <span>{t("att.checkOut")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={acting || !allowed}
                    title={allowed ? undefined : t("att.required")}
                    onClick={() => void runAction(() => onCheckIn(member.member_id))}
                  >
                    <CalendarCheck size={16} />
                    <span>{allowed ? t("att.checkIn") : t("att.required")}</span>
                  </button>
                )
              ) : null}
              <button type="button" className="secondary" onClick={() => onOpenProfile(member.member_id)}>
                {t("qr.viewProfile")}
              </button>
            </div>
            {!member.is_active ? <p className="field-hint">{t("qr.inactiveHint")}</p> : null}
          </article>
        ) : null}

        {idle ? (
          <div className="form-actions">
            <button type="button" className="primary" onClick={scanAgain}>
              <QrCode size={16} />
              <span>{phase === "camera" ? t("qr.tryAgain") : t("qr.scanAgain")}</span>
            </button>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
