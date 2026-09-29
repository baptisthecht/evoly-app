"use client";

import { useState } from "react";

type BlockType = "text" | "image" | "button" | "divider" | "event_info";

interface Block {
  id: string;
  type: BlockType;
  content: Record<string, string>;
}

interface EditorValue {
  blocks: Block[];
}

interface Props {
  value: object;
  onChange: (value: object) => void;
}

const BLOCK_TYPES: { type: BlockType; icon: string; label: string }[] = [
  { type: "text", icon: "📝", label: "Texte" },
  { type: "image", icon: "🖼️", label: "Image" },
  { type: "button", icon: "🔘", label: "Bouton" },
  { type: "divider", icon: "─", label: "Séparateur" },
  { type: "event_info", icon: "📅", label: "Infos événement" },
];

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function defaultContent(type: BlockType): Record<string, string> {
  switch (type) {
    case "text": return { text: "Écrivez votre message ici..." };
    case "image": return { url: "", alt: "", link: "" };
    case "button": return { text: "En savoir plus", url: "", color: "#7c3aed" };
    case "divider": return { color: "#e5e7eb" };
    case "event_info": return {};
    default: return {};
  }
}

export function EmailEditor({ value, onChange }: Props) {
  const editorValue = value as EditorValue;
  const blocks: Block[] = editorValue?.blocks ?? [];

  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");

  function addBlock(type: BlockType) {
    const newBlock: Block = { id: genId(), type, content: defaultContent(type) };
    onChange({ blocks: [...blocks, newBlock] });
  }

  function updateBlock(id: string, content: Record<string, string>) {
    onChange({ blocks: blocks.map((b) => (b.id === id ? { ...b, content } : b)) });
  }

  function removeBlock(id: string) {
    onChange({ blocks: blocks.filter((b) => b.id !== id) });
  }

  function moveBlock(id: string, dir: "up" | "down") {
    const idx = blocks.findIndex((b) => b.id === id);
    if (dir === "up" && idx === 0) return;
    if (dir === "down" && idx === blocks.length - 1) return;
    const newBlocks = [...blocks];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    [newBlocks[idx], newBlocks[swap]] = [newBlocks[swap], newBlocks[idx]];
    onChange({ blocks: newBlocks });
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.type}
              type="button"
              onClick={() => addBlock(bt.type)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-white hover:text-gray-900 rounded-lg whitespace-nowrap border border-transparent hover:border-gray-200 transition-colors"
              title={`Ajouter un bloc ${bt.label}`}
            >
              <span>{bt.icon}</span>
              <span>{bt.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPreviewMode(previewMode === "edit" ? "preview" : "edit")}
          className="flex-shrink-0 text-xs text-violet-600 hover:underline px-2"
        >
          {previewMode === "edit" ? "Aperçu" : "Éditer"}
        </button>
      </div>

      {/* Blocks */}
      <div className="min-h-[200px] bg-white">
        {previewMode === "preview" ? (
          <EmailPreview blocks={blocks} />
        ) : (
          <div className="divide-y divide-gray-100">
            {blocks.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                Cliquez sur un type de bloc pour commencer.
              </div>
            ) : (
              blocks.map((block, idx) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  isFirst={idx === 0}
                  isLast={idx === blocks.length - 1}
                  onChange={(content) => updateBlock(block.id, content)}
                  onRemove={() => removeBlock(block.id)}
                  onMove={(dir) => moveBlock(block.id, dir)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="bg-gray-50 border-t border-gray-200 px-3 py-2">
        <p className="text-xs text-gray-400">
          Un footer de désinscription est ajouté automatiquement à chaque email.
        </p>
      </div>
    </div>
  );
}

function BlockEditor({
  block, isFirst, isLast, onChange, onRemove, onMove,
}: {
  block: Block;
  isFirst: boolean;
  isLast: boolean;
  onChange: (content: Record<string, string>) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const blockLabel = BLOCK_TYPES.find((b) => b.type === block.type)?.label ?? block.type;

  return (
    <div className="group relative p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{blockLabel}</span>
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => onMove("up")} disabled={isFirst}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 rounded">↑</button>
          <button type="button" onClick={() => onMove("down")} disabled={isLast}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20 rounded">↓</button>
          <button type="button" onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600 rounded">✕</button>
        </div>
      </div>

      {block.type === "text" && (
        <textarea
          value={block.content.text ?? ""}
          onChange={(e) => onChange({ ...block.content, text: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
          placeholder="Votre texte..."
        />
      )}

      {block.type === "image" && (
        <div className="space-y-2">
          <input type="url" value={block.content.url ?? ""} onChange={(e) => onChange({ ...block.content, url: e.target.value })}
            placeholder="URL de l'image" className={inputCls} />
          <input type="text" value={block.content.alt ?? ""} onChange={(e) => onChange({ ...block.content, alt: e.target.value })}
            placeholder="Texte alternatif" className={inputCls} />
          <input type="url" value={block.content.link ?? ""} onChange={(e) => onChange({ ...block.content, link: e.target.value })}
            placeholder="Lien (optionnel)" className={inputCls} />
        </div>
      )}

      {block.type === "button" && (
        <div className="space-y-2">
          <input type="text" value={block.content.text ?? ""} onChange={(e) => onChange({ ...block.content, text: e.target.value })}
            placeholder="Texte du bouton" className={inputCls} />
          <input type="url" value={block.content.url ?? ""} onChange={(e) => onChange({ ...block.content, url: e.target.value })}
            placeholder="URL de destination" className={inputCls} />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Couleur</label>
            <input type="color" value={block.content.color ?? "#7c3aed"}
              onChange={(e) => onChange({ ...block.content, color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0" />
          </div>
        </div>
      )}

      {block.type === "divider" && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">Séparateur</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {block.type === "event_info" && (
        <div className="bg-violet-50 rounded-lg p-3 text-sm text-violet-700">
          📅 Les informations de l&apos;événement (titre, date, lieu) seront insérées automatiquement.
        </div>
      )}
    </div>
  );
}

function EmailPreview({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-400">Aperçu vide.</div>;
  }

  return (
    <div className="p-4 max-w-sm mx-auto space-y-3 font-sans">
      {blocks.map((block) => {
        if (block.type === "text") {
          return (
            <p key={block.id} className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {block.content.text}
            </p>
          );
        }
        if (block.type === "image" && block.content.url) {
          return (
            <img key={block.id} src={block.content.url} alt={block.content.alt ?? ""} className="w-full rounded-lg" />
          );
        }
        if (block.type === "button") {
          return (
            <div key={block.id} className="text-center">
              <span
                className="inline-block px-6 py-2.5 text-white text-sm font-semibold rounded-lg"
                style={{ backgroundColor: block.content.color ?? "#7c3aed" }}
              >
                {block.content.text || "Bouton"}
              </span>
            </div>
          );
        }
        if (block.type === "divider") {
          return <hr key={block.id} className="border-gray-200" />;
        }
        if (block.type === "event_info") {
          return (
            <div key={block.id} className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              📅 <strong>Nom de l&apos;événement</strong><br />
              📍 Lieu · Date et heure
            </div>
          );
        }
        return null;
      })}
      <div className="pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
        Se désinscrire · Envoyé via Evoly
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
