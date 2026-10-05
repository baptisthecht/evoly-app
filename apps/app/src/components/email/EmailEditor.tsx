"use client";

import type { EmailDoc } from "@evoly/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { uploadFile } from "@/app/o/[orgSlug]/brand/BrandClient";
import { EMAIL_BLOCKS, emailExtensions } from "./extensions";

const TEXT_COLORS = ["#222222", "#6b6b6b", "#c2185b", "#7c3aed", "#1d4ed8", "#15803d", "#b91c1c"];
const field =
  "block w-full rounded-md bg-surface-raised px-3 py-2 text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]";

function Tool({
  label,
  active,
  onClick,
  children,
  disabled,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-9 min-w-9 place-items-center rounded-md px-2 text-sm font-semibold disabled:opacity-40 ${active ? "bg-ink text-surface-raised" : "hover:bg-surface-sunken"}`}
    >
      {children}
    </button>
  );
}

/** Éditeur visuel des e-mails (campagnes, e-mails automatiques, blocs des e-mails de billets). */
export function EmailEditor({
  orgSlug,
  value,
  onChange,
  events,
  allowHtml = true,
}: {
  orgSlug: string;
  value: EmailDoc;
  onChange: (doc: EmailDoc) => void;
  events: Array<{ id: string; title: string }>;
  allowHtml?: boolean;
}) {
  const t = useTranslations("emailEditor");
  const titles = useRef(new Map(events.map((e) => [e.id, e.title])));
  const editor = useEditor({
    extensions: emailExtensions({
      placeholder: t("placeholder"),
      firstName: t("firstName"),
      html: t("html"),
      titleOf: (id) => titles.current.get(id) ?? t("event"),
    }),
    content: value,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "email-editor__content", "aria-label": t("content"), "aria-multiline": "true", role: "textbox" } },
    // copie JSON : les réglages des nœuds de TipTap ne sont pas des objets ordinaires, et les actions serveur
    // ne sauraient pas les transmettre (le serveur recevrait des réglages vides : bouton sans adresse, alignements perdus)
    onUpdate: ({ editor: e }) => onChange(JSON.parse(JSON.stringify(e.getJSON())) as EmailDoc),
  });
  if (!editor) return <div className="min-h-72 rounded-lg bg-surface-raised ring-1 ring-line" aria-busy="true" />;
  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg bg-surface-raised ring-1 ring-line">
        <Toolbar editor={editor} orgSlug={orgSlug} events={events} allowHtml={allowHtml} />
        <EditorContent editor={editor} />
      </div>
      <Inspector editor={editor} orgSlug={orgSlug} events={events} />
    </div>
  );
}

function Toolbar({
  editor,
  orgSlug,
  events,
  allowHtml,
}: {
  editor: Editor;
  orgSlug: string;
  events: Array<{ id: string; title: string }>;
  allowHtml: boolean;
}) {
  const t = useTranslations("emailEditor");
  const [link, setLink] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const c = () => editor.chain().focus();
  const style = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";
  // bloc sélectionné : l'insertion se fait juste après lui, sans le remplacer
  const after = () => (editor.state.selection instanceof NodeSelection ? editor.state.selection.to : null);
  const insert = (node: Record<string, unknown>) => {
    const at = after();
    return at === null ? c().insertContent(node).run() : c().insertContentAt(at, node).run();
  };
  const upload = async (f: File) => {
    setUploading(true);
    setError(null);
    const r = await uploadFile(orgSlug, f, "campaign").catch(() => ({ url: undefined }));
    setUploading(false);
    if (r.url) insert({ type: "image", attrs: { src: r.url, alt: "" } });
    else setError(t("uploadFailed"));
  };
  return (
    <div className="grid gap-2 border-b border-line bg-surface p-2">
      <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-1">
        <select
          aria-label={t("style")}
          value={style}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") c().setParagraph().run();
            else
              c()
                .toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 })
                .run();
          }}
          className="h-9 rounded-md bg-surface-raised px-2 text-base shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
        >
          <option value="p">{t("paragraph")}</option>
          <option value="h1">{t("heading1")}</option>
          <option value="h2">{t("heading2")}</option>
          <option value="h3">{t("heading3")}</option>
        </select>
        <Tool label={t("bold")} active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}>
          <b>B</b>
        </Tool>
        <Tool label={t("italic")} active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}>
          <i>I</i>
        </Tool>
        <Tool label={t("underline")} active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}>
          <u>U</u>
        </Tool>
        <Tool label={t("strike")} active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}>
          <s>S</s>
        </Tool>
        <Tool
          label={t("link")}
          active={editor.isActive("link")}
          onClick={() => setLink(link === null ? ((editor.getAttributes("link").href as string | undefined) ?? "https://") : null)}
        >
          {t("link")}
        </Tool>
        <Tool label={t("bulletList")} active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}>
          •
        </Tool>
        <Tool label={t("orderedList")} active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}>
          1.
        </Tool>
        <Tool label={t("quote")} active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}>
          ❝
        </Tool>
        {(["left", "center", "right"] as const).map((a) => (
          <Tool
            key={a}
            label={t(a === "left" ? "alignLeft" : a === "center" ? "alignCenter" : "alignRight")}
            active={editor.isActive({ textAlign: a })}
            onClick={() => c().setTextAlign(a).run()}
          >
            {a === "left" ? "⇤" : a === "center" ? "↔" : "⇥"}
          </Tool>
        ))}
        <span className="flex items-center gap-1" role="group" aria-label={t("color")}>
          {TEXT_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              aria-label={`${t("color")} ${col}`}
              aria-pressed={editor.isActive("textStyle", { color: col })}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => c().setColor(col).run()}
              className="h-6 w-6 rounded-full ring-1 ring-line aria-pressed:ring-2 aria-pressed:ring-ink"
              style={{ background: col }}
            />
          ))}
          <Tool label={t("colorReset")} onClick={() => c().unsetColor().run()}>
            ⨯
          </Tool>
        </span>
        <Tool label={t("undo")} disabled={!editor.can().undo()} onClick={() => c().undo().run()}>
          ↶
        </Tool>
        <Tool label={t("redo")} disabled={!editor.can().redo()} onClick={() => c().redo().run()}>
          ↷
        </Tool>
      </div>
      {link !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={t("linkUrl")} value={link} onChange={(e) => setLink(e.target.value)} className={`${field} max-w-sm`} inputMode="url" />
          <button
            type="button"
            className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-surface-raised"
            onClick={() => {
              if (link.trim()) c().extendMarkRange("link").setLink({ href: link.trim() }).run();
              setLink(null);
            }}
          >
            {t("linkApply")}
          </button>
          <button
            type="button"
            className="h-10 rounded-full px-4 text-sm font-semibold hover:bg-surface-sunken"
            onClick={() => {
              c().extendMarkRange("link").unsetLink().run();
              setLink(null);
            }}
          >
            {t("linkRemove")}
          </button>
        </div>
      )}
      <div role="toolbar" aria-label={t("insert")} className="flex flex-wrap items-center gap-1 text-sm">
        <span className="px-1 text-ink-muted">{t("insert")}</span>
        <Tool label={t("image")} disabled={uploading} onClick={() => file.current?.click()}>
          {uploading ? t("uploading") : t("image")}
        </Tool>
        <input
          ref={file}
          data-testid="email-image-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <Tool label={t("button")} onClick={() => insert({ type: "button", attrs: { label: t("buttonDefault"), href: "https://", align: "left" } })}>
          {t("button")}
        </Tool>
        {events.length > 0 && (
          <Tool label={t("event")} onClick={() => insert({ type: "eventCard", attrs: { eventId: events[0]!.id } })}>
            {t("event")}
          </Tool>
        )}
        <Tool label={t("divider")} onClick={() => insert({ type: "horizontalRule" })}>
          {t("divider")}
        </Tool>
        <Tool label={t("spacer")} onClick={() => insert({ type: "spacer", attrs: { height: 24 } })}>
          {t("spacer")}
        </Tool>
        <Tool label={t("firstName")} onClick={() => insert({ type: "mergeTag", attrs: { name: "prenom" } })}>
          {`{{${t("firstName")}}}`}
        </Tool>
        {allowHtml && (
          <Tool label={t("html")} onClick={() => insert({ type: "rawHtml", attrs: { html: "" } })}>
            {"</>"} {t("html")}
          </Tool>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Réglages du bloc sélectionné (bouton, image, événement, espace, HTML). */
function Inspector({ editor, orgSlug, events }: { editor: Editor; orgSlug: string; events: Array<{ id: string; title: string }> }) {
  const t = useTranslations("emailEditor");
  void orgSlug;
  const sel = editor.state.selection;
  const node = sel instanceof NodeSelection ? sel.node : null;
  const kind = node && (EMAIL_BLOCKS as readonly string[]).includes(node.type.name) ? node.type.name : null;
  if (!node || !kind) return null;
  const a = node.attrs as Record<string, unknown>;
  const set = (attrs: Record<string, unknown>) => editor.chain().updateAttributes(kind, attrs).run();
  const alignSelect = (
    <label className="grid gap-1 text-sm font-semibold">
      {t("align")}
      <select value={String(a.align ?? "left")} onChange={(e) => set({ align: e.target.value })} className={field}>
        <option value="left">{t("left")}</option>
        <option value="center">{t("center")}</option>
        <option value="right">{t("right")}</option>
      </select>
    </label>
  );
  return (
    <section
      aria-label={t(kind === "eventCard" ? "event" : kind === "rawHtml" ? "html" : (kind as "button" | "image" | "spacer"))}
      className="grid gap-3 rounded-lg bg-surface-raised p-4 ring-1 ring-line"
    >
      {kind === "button" && (
        <>
          <label className="grid gap-1 text-sm font-semibold">
            {t("buttonLabel")}
            <input value={String(a.label ?? "")} maxLength={80} onChange={(e) => set({ label: e.target.value })} className={field} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("buttonUrl")}
            <input value={String(a.href ?? "")} onChange={(e) => set({ href: e.target.value })} className={field} inputMode="url" />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              {t("buttonColor")}
              <input
                type="color"
                value={typeof a.color === "string" ? a.color : "#ffb8e8"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-10 w-16 rounded-md"
              />
            </label>
            <button type="button" className="h-10 rounded-full px-4 text-sm font-semibold hover:bg-surface-sunken" onClick={() => set({ color: null })}>
              {t("brandColor")}
            </button>
          </div>
          {alignSelect}
        </>
      )}
      {kind === "image" && (
        <>
          <label className="grid gap-1 text-sm font-semibold">
            {t("imageUrl")}
            <input value={String(a.src ?? "")} onChange={(e) => set({ src: e.target.value })} className={field} inputMode="url" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("imageAlt")}
            <input value={String(a.alt ?? "")} maxLength={200} onChange={(e) => set({ alt: e.target.value })} className={field} />
            <span className="text-xs font-normal text-ink-muted">{t("imageAltHint")}</span>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("imageWidth")} : {Number(a.width ?? 100)} %
            <input type="range" min={20} max={100} step={10} value={Number(a.width ?? 100)} onChange={(e) => set({ width: Number(e.target.value) })} />
          </label>
          {alignSelect}
        </>
      )}
      {kind === "eventCard" && (
        <label className="grid gap-1 text-sm font-semibold">
          {t("eventPick")}
          <select value={String(a.eventId ?? "")} onChange={(e) => set({ eventId: e.target.value })} className={field}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "spacer" && (
        <label className="grid gap-1 text-sm font-semibold">
          {t("spacerHeight")} : {Number(a.height ?? 24)} px
          <input type="range" min={8} max={96} step={8} value={Number(a.height ?? 24)} onChange={(e) => set({ height: Number(e.target.value) })} />
        </label>
      )}
      {kind === "rawHtml" && (
        <label className="grid gap-1 text-sm font-semibold">
          {t("htmlCode")}
          <textarea value={String(a.html ?? "")} rows={8} spellCheck={false} onChange={(e) => set({ html: e.target.value })} className={`${field} font-mono`} />
          <span className="text-xs font-normal text-ink-muted">{t("htmlHint")}</span>
        </label>
      )}
      <button
        type="button"
        className="justify-self-start rounded-full px-4 py-2 text-sm font-semibold text-danger hover:bg-surface-sunken"
        onClick={() => editor.chain().focus().deleteSelection().run()}
      >
        {t("remove")}
      </button>
    </section>
  );
}
