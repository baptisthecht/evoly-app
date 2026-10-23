import { render } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { Fr } from "./intl";

function Missing() {
  const t = useTranslations("common");
  return <p>{t("cle_qui_n_existe_pas")}</p>;
}

describe("garde des traductions", () => {
  it("un texte sans traduction fait échouer le test de l'écran", () => {
    const quiet = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(() =>
      render(
        <Fr>
          <Missing />
        </Fr>,
      ),
    ).toThrow(/MISSING_MESSAGE|cle_qui_n_existe_pas/);
    quiet.mockRestore();
  });
});
