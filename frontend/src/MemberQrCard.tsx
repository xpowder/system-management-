import { Download, MessageCircle } from "lucide-react";
import { gymApi } from "./gymApi";
import { useLang } from "./i18n";

function moroccoWhatsAppNumber(phone: string) {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return "";
  if (digits.startsWith("212") && digits.length >= 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  if (digits.length === 9 && "567".includes(digits[0] || "")) return `212${digits}`;
  return digits.length >= 9 ? digits : "";
}

function isSafeWhatsAppUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "wa.me" || host === "api.whatsapp.com" || host === "web.whatsapp.com" || host.endsWith(".whatsapp.com");
  } catch {
    return false;
  }
}

export function MemberQrCard({
  memberId,
  memberName,
  phone,
  compact,
  onError,
  onNotice,
}: {
  memberId: number;
  memberName: string;
  phone?: string;
  compact?: boolean;
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
}) {
  const { t } = useLang();
  const number = moroccoWhatsAppNumber(phone || "");

  const saveImage = () => {
    void gymApi.downloadMemberQr(memberId).catch((e) => {
      onError(e instanceof Error ? e.message : t("card.saveFail"));
    });
  };

  const sendWhatsApp = async () => {
    if (!number) {
      onError(t("card.noPhone"));
      return;
    }
    try {
      await gymApi.downloadMemberQr(memberId);
      const url = `https://wa.me/${number}?text=${encodeURIComponent(t("card.waText", { name: memberName }))}`;
      if (!isSafeWhatsAppUrl(url)) {
        onError(t("card.waFail"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      onNotice?.(t("card.waOpened", { name: memberName }));
    } catch (e) {
      onError(e instanceof Error ? e.message : t("card.waFail"));
    }
  };

  return (
    <div className={`member-qr-card${compact ? " is-compact" : ""}`}>
      <img className="desk-qr" src={gymApi.memberQrUrl(memberId)} alt={t("att.qr")} />
      <div className="member-qr-card-copy">
        {!compact ? (
          <>
            <span className="eyebrow">{t("card.title")}</span>
            <p>{t("card.hint")}</p>
          </>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={saveImage}>
            <Download size={16} /> {t("card.save")}
          </button>
          <button type="button" className="whatsapp-button" disabled={!number} onClick={() => void sendWhatsApp()}>
            <MessageCircle size={16} /> {t("card.whatsapp")}
          </button>
        </div>
        {!number && !compact ? <small>{t("card.noPhone")}</small> : null}
      </div>
    </div>
  );
}
