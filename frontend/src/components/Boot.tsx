// Launch screen: a clean, animated hold while the engine boots, and a calm
// offline state if it never answers. Fully localised.
import { useI18n } from "../lib/i18n";

export function Boot({ state, onRetry }: { state: "starting" | "offline"; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className={`boot ${state}`}>
      <div className="boot-stage">
        <span className="boot-ring" aria-hidden />
        <span className="boot-ring boot-ring-2" aria-hidden />
        <img className="boot-logo" src="logo.png" alt="0xFLUX" width={72} height={72} />
      </div>
      <div className="boot-name"><b>0x</b>FLUX</div>

      {state === "starting" ? (
        <>
          <div className="boot-bar"><span /></div>
          <p className="boot-status">{t("boot.starting")}</p>
        </>
      ) : (
        <>
          <p className="boot-err">{t("boot.offline.title")}</p>
          <p>{t("boot.offline.body")}</p>
          <p className="boot-hint">{t("boot.offline.hint")}</p>
          {onRetry && <button className="btn btn-sm" onClick={onRetry}>{t("boot.retry")}</button>}
        </>
      )}
      <div className="boot-foot">developed by 0x3</div>
    </div>
  );
}
