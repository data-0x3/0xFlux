import { Page } from "../components/Page";
import { Card } from "../components/ui";
import { IconGithub, IconTelegram } from "../components/icons";
import { useI18n } from "../lib/i18n";

const TELEGRAM = "https://t.me/data0x3";
const GITHUB = "https://github.com/data-0x3";

export default function Developer() {
  const { t } = useI18n();
  return (
    <Page title={t("developer.title")} sub={t("developer.sub")}>
      <div className="dev-wrap">
        <Card className="dev-card">
          <div className="dev-head">
            <img className="dev-avatar" src="0x3.gif" alt="0x3" width={132} height={132} />
            <div className="dev-id">
              <div className="dev-name">0x3</div>
              <div className="dev-role">{t("developer.role")}</div>
              <p className="dev-bio">{t("developer.bio")}</p>
            </div>
          </div>

          <div className="dev-links">
            <a className="dev-link" href={TELEGRAM} target="_blank" rel="noreferrer noopener">
              <span className="dev-link-ic"><IconTelegram /></span>
              <span>
                <span className="dev-link-label">Telegram</span>
                <span className="dev-link-val mono">t.me/data0x3</span>
              </span>
            </a>
            <a className="dev-link" href={GITHUB} target="_blank" rel="noreferrer noopener">
              <span className="dev-link-ic"><IconGithub /></span>
              <span>
                <span className="dev-link-label">GitHub</span>
                <span className="dev-link-val mono">github.com/data-0x3</span>
              </span>
            </a>
          </div>
        </Card>

        <p className="dev-foot mono">0xFLUX v0.1.0 · developed by 0x3</p>
      </div>
    </Page>
  );
}
